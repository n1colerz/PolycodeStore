// Package api expone la API HTTP del contrato con net/http.
package api

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"strings"

	"polystore/internal/almacen"
	"polystore/internal/concurrencia"
	"polystore/internal/errores"
	"polystore/internal/modelos"
	"polystore/internal/reglas"
)

// Servidor enruta y responde las peticiones HTTP.
type Servidor struct {
	almacen  *almacen.Almacen
	catalogo reglas.Catalogo
	lenguaje string
}

// NuevoServidor crea el servidor con su almacén y catálogo.
func NuevoServidor(almacenPedidos *almacen.Almacen, catalogo reglas.Catalogo, lenguaje string) *Servidor {
	return &Servidor{almacen: almacenPedidos, catalogo: catalogo, lenguaje: lenguaje}
}

// Handler devuelve el manejador HTTP con CORS y preflight.
func (s *Servidor) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/", s.enrutar)
	return s.conCORS(mux)
}

func (s *Servidor) conCORS(siguiente http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cabecera := w.Header()
		cabecera.Set("Access-Control-Allow-Origin", "*")
		cabecera.Set("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS")
		cabecera.Set("Access-Control-Allow-Headers", "Content-Type")
		cabecera.Set("Access-Control-Max-Age", "86400")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		siguiente.ServeHTTP(w, r)
	})
}

// --------------------------------------------------------------- enrutado

func (s *Servidor) enrutar(w http.ResponseWriter, r *http.Request) {
	partes := segmentos(r.URL.Path)
	ruta := rutaNormalizada(r.URL.Path)

	switch {
	case len(partes) == 1 && partes[0] == "salud":
		if !s.metodoPermitido(w, r, http.MethodGet, ruta) {
			return
		}
		s.salud(w)

	case len(partes) == 1 && partes[0] == "resumen":
		if !s.metodoPermitido(w, r, http.MethodGet, ruta) {
			return
		}
		s.resumen(w)

	case len(partes) == 1 && partes[0] == "pedidos":
		switch r.Method {
		case http.MethodGet:
			s.listar(w, r)
		case http.MethodPost:
			s.crear(w, r)
		default:
			s.error(w, errores.MetodoNoPermitido(r.Method, ruta))
		}

	case len(partes) == 2 && partes[0] == "pedidos" && partes[1] == "lote":
		if !s.metodoPermitido(w, r, http.MethodPost, ruta) {
			return
		}
		s.lote(w, r)

	case len(partes) == 2 && partes[0] == "pedidos":
		if !s.metodoPermitido(w, r, http.MethodGet, ruta) {
			return
		}
		s.obtener(w, partes[1])

	case len(partes) == 3 && partes[0] == "pedidos" && partes[2] == "estado":
		if !s.metodoPermitido(w, r, http.MethodPatch, ruta) {
			return
		}
		s.cambiarEstado(w, r, partes[1])

	default:
		s.error(w, errores.RutaNoEncontrada(ruta))
	}
}

func (s *Servidor) metodoPermitido(w http.ResponseWriter, r *http.Request, esperado, ruta string) bool {
	if r.Method == esperado {
		return true
	}
	s.error(w, errores.MetodoNoPermitido(r.Method, ruta))
	return false
}

// -------------------------------------------------------------- endpoints

func (s *Servidor) salud(w http.ResponseWriter) {
	escribirJSON(w, http.StatusOK, modelos.Salud{
		Lenguaje:         s.lenguaje,
		Estado:           "ok",
		Version:          modelos.Version,
		PedidosEnMemoria: s.almacen.Total(),
	})
}

func (s *Servidor) listar(w http.ResponseWriter, r *http.Request) {
	consulta := r.URL.Query()

	var clienteID *string
	if consulta.Has("clienteId") {
		valor := consulta.Get("clienteId")
		clienteID = &valor
	}
	var estado *string
	if consulta.Has("estado") {
		valor := consulta.Get("estado")
		estado = &valor
	}
	var orden *string
	if consulta.Has("orden") {
		valor := consulta.Get("orden")
		orden = &valor
	}

	if estado != nil && !contiene(modelos.Estados, *estado) {
		s.error(w, errores.EstadoInvalido())
		return
	}
	if orden != nil && *orden != "fecha" && *orden != "monto" && *orden != "prioridad" {
		s.error(w, errores.OrdenInvalido())
		return
	}

	pedidos := s.almacen.Listar(clienteID, estado, orden)
	escribirJSON(w, http.StatusOK, modelos.ListaPedidos{Pedidos: pedidos, Total: len(pedidos)})
}

func (s *Servidor) obtener(w http.ResponseWriter, id string) {
	pedido, ok := s.almacen.Obtener(id)
	if !ok {
		s.error(w, errores.PedidoNoEncontrado(id))
		return
	}
	escribirJSON(w, http.StatusOK, reglas.ConCalculos(pedido, s.almacen.Clientes()[pedido.ClienteID]))
}

func (s *Servidor) crear(w http.ResponseWriter, r *http.Request) {
	mapa, err := leerObjeto(r)
	if err != nil {
		s.error(w, err)
		return
	}

	pedido, err := reglas.ValidarPedido(mapa, s.catalogo)
	if err != nil {
		s.error(w, err)
		return
	}
	if err := s.almacen.Agregar(pedido); err != nil {
		s.error(w, err)
		return
	}

	w.Header().Set("Location", "/pedidos/"+url.PathEscape(pedido.ID))
	escribirJSON(w, http.StatusCreated, reglas.ConCalculos(pedido, s.almacen.Clientes()[pedido.ClienteID]))
}

func (s *Servidor) cambiarEstado(w http.ResponseWriter, r *http.Request, id string) {
	mapa, err := leerObjeto(r)
	if err != nil {
		s.error(w, err)
		return
	}

	bruto, ok := mapa["estado"]
	if !ok || esNull(bruto) {
		s.error(w, errores.CampoRequerido("estado"))
		return
	}
	var estado string
	if e := json.Unmarshal(bruto, &estado); e != nil {
		s.error(w, errores.TipoInvalido("estado"))
		return
	}

	pedido, err := s.almacen.ActualizarEstado(id, estado)
	if err != nil {
		s.error(w, err)
		return
	}
	escribirJSON(w, http.StatusOK, reglas.ConCalculos(pedido, s.almacen.Clientes()[pedido.ClienteID]))
}

func (s *Servidor) resumen(w http.ResponseWriter) {
	escribirJSON(w, http.StatusOK, s.almacen.Resumen())
}

func (s *Servidor) lote(w http.ResponseWriter, r *http.Request) {
	mapa, err := leerObjeto(r)
	if err != nil {
		s.error(w, err)
		return
	}

	bruto, ok := mapa["pedidos"]
	if !ok || esNull(bruto) {
		s.error(w, errores.CampoRequerido("pedidos"))
		return
	}
	var brutos []json.RawMessage
	if e := json.Unmarshal(bruto, &brutos); e != nil {
		s.error(w, errores.TipoInvalido("pedidos"))
		return
	}

	lote, err := concurrencia.ProcesarLote(brutos, s.catalogo, concurrencia.TrabajadoresPorDefecto())
	if err != nil {
		s.error(w, err)
		return
	}
	escribirJSON(w, http.StatusOK, lote)
}

// -------------------------------------------------------------- utilidades

func (s *Servidor) error(w http.ResponseWriter, err *errores.Dominio) {
	escribirJSON(w, err.HTTP, err.API())
}

func escribirJSON(w http.ResponseWriter, status int, valor any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	codificador := json.NewEncoder(w)
	codificador.SetEscapeHTML(false)
	codificador.Encode(valor)
}

// leerObjeto lee el cuerpo de la petición y exige un objeto JSON.
func leerObjeto(r *http.Request) (map[string]json.RawMessage, *errores.Dominio) {
	cuerpo, err := io.ReadAll(r.Body)
	if err != nil {
		return nil, errores.JSONInvalido()
	}

	decodificador := json.NewDecoder(bytes.NewReader(cuerpo))
	decodificador.UseNumber()
	var raiz any
	if e := decodificador.Decode(&raiz); e != nil {
		return nil, errores.JSONInvalido()
	}
	if decodificador.More() {
		return nil, errores.JSONInvalido()
	}
	if _, ok := raiz.(map[string]any); !ok {
		return nil, errores.CuerpoInvalido("")
	}

	var mapa map[string]json.RawMessage
	if e := json.Unmarshal(cuerpo, &mapa); e != nil {
		return nil, errores.JSONInvalido()
	}
	return mapa, nil
}

func esNull(bruto json.RawMessage) bool {
	return string(bytes.TrimSpace(bruto)) == "null"
}

func contiene(lista []string, valor string) bool {
	for _, elemento := range lista {
		if elemento == valor {
			return true
		}
	}
	return false
}

func segmentos(ruta string) []string {
	partes := strings.Split(strings.Trim(ruta, "/"), "/")
	resultado := make([]string, 0, len(partes))
	for _, parte := range partes {
		if parte == "" {
			continue
		}
		decodificada, err := url.PathUnescape(parte)
		if err != nil {
			decodificada = parte
		}
		resultado = append(resultado, decodificada)
	}
	return resultado
}

func rutaNormalizada(ruta string) string {
	if ruta == "" || ruta == "/" {
		return "/"
	}
	return strings.TrimRight(ruta, "/")
}
