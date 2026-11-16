// Package iojson centraliza la lectura y escritura de JSON y la carga de
// catálogos y datasets.
package iojson

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"polystore/internal/errores"
	"polystore/internal/modelos"
)

func leerTexto(ruta string) (string, error) {
	if ruta == "-" {
		datos, err := io.ReadAll(os.Stdin)
		if err != nil {
			return "", &errores.Datos{Mensaje: "No se pudo leer la entrada estándar."}
		}
		return string(datos), nil
	}
	datos, err := os.ReadFile(ruta)
	if err != nil {
		return "", &errores.Datos{Mensaje: fmt.Sprintf("No se pudo leer '%s': %v", ruta, err)}
	}
	return string(datos), nil
}

// LeerJSON carga un archivo JSON.
func LeerJSON(ruta string) (any, error) {
	texto, err := leerTexto(ruta)
	if err != nil {
		return nil, err
	}
	decodificador := json.NewDecoder(strings.NewReader(texto))
	decodificador.UseNumber()
	var valor any
	if e := decodificador.Decode(&valor); e != nil {
		return nil, &errores.Datos{Mensaje: fmt.Sprintf("El archivo '%s' no contiene JSON válido: %v", ruta, e)}
	}
	return valor, nil
}

// EscribirJSON guarda un valor como JSON UTF-8 con sangrado de dos espacios.
func EscribirJSON(ruta string, valor any) error {
	var buffer bytes.Buffer
	codificador := json.NewEncoder(&buffer)
	codificador.SetEscapeHTML(false)
	codificador.SetIndent("", "  ")
	if e := codificador.Encode(valor); e != nil {
		return &errores.Datos{Mensaje: fmt.Sprintf("No se pudo serializar la salida: %v", e)}
	}

	if e := os.MkdirAll(filepath.Dir(ruta), 0o755); e != nil {
		return &errores.Datos{Mensaje: fmt.Sprintf("No se pudo crear el directorio de '%s': %v", ruta, e)}
	}
	if e := os.WriteFile(ruta, buffer.Bytes(), 0o644); e != nil {
		return &errores.Datos{Mensaje: fmt.Sprintf("No se pudo escribir '%s': %v", ruta, e)}
	}
	return nil
}

// SerializarJSON devuelve el JSON de un valor como texto.
func SerializarJSON(valor any) (string, error) {
	var buffer bytes.Buffer
	codificador := json.NewEncoder(&buffer)
	codificador.SetEscapeHTML(false)
	codificador.SetIndent("", "  ")
	if e := codificador.Encode(valor); e != nil {
		return "", &errores.Datos{Mensaje: fmt.Sprintf("No se pudo serializar la salida: %v", e)}
	}
	return buffer.String(), nil
}

// CargarClientes carga el catálogo de clientes indexado por id.
func CargarClientes(directorio string) (map[string]modelos.Cliente, error) {
	ruta := filepath.Join(directorio, "clientes.json")
	datos, err := os.ReadFile(ruta)
	if err != nil {
		return nil, &errores.Datos{Mensaje: fmt.Sprintf("No se pudo leer '%s': %v", ruta, err)}
	}

	var archivo struct {
		Version  int               `json:"version"`
		Clientes []modelos.Cliente `json:"clientes"`
	}
	if e := json.Unmarshal(datos, &archivo); e != nil {
		return nil, &errores.Datos{Mensaje: fmt.Sprintf("El archivo '%s' no contiene JSON válido: %v", ruta, e)}
	}

	clientes := make(map[string]modelos.Cliente, len(archivo.Clientes))
	for _, cliente := range archivo.Clientes {
		if cliente.ID == "" || cliente.Nombre == "" || cliente.Email == "" || cliente.Tipo == "" {
			return nil, &errores.Datos{Mensaje: fmt.Sprintf("El archivo '%s' tiene un cliente con campos inválidos.", ruta)}
		}
		if cliente.Tipo != "vip" && cliente.Tipo != "regular" {
			return nil, &errores.Datos{Mensaje: fmt.Sprintf("El cliente '%s' tiene un tipo inválido.", cliente.ID)}
		}
		if _, ok := clientes[cliente.ID]; ok {
			return nil, &errores.Datos{Mensaje: fmt.Sprintf("El cliente '%s' está duplicado.", cliente.ID)}
		}
		clientes[cliente.ID] = cliente
	}
	return clientes, nil
}

// CargarProductos carga el catálogo de productos de referencia.
func CargarProductos(directorio string) ([]modelos.Producto, error) {
	ruta := filepath.Join(directorio, "productos.json")
	datos, err := os.ReadFile(ruta)
	if err != nil {
		return nil, &errores.Datos{Mensaje: fmt.Sprintf("No se pudo leer '%s': %v", ruta, err)}
	}

	var archivo struct {
		Version   int                `json:"version"`
		Productos []modelos.Producto `json:"productos"`
	}
	if e := json.Unmarshal(datos, &archivo); e != nil {
		return nil, &errores.Datos{Mensaje: fmt.Sprintf("El archivo '%s' no contiene JSON válido: %v", ruta, e)}
	}

	vistos := make(map[string]bool, len(archivo.Productos))
	for _, producto := range archivo.Productos {
		if producto.Codigo == "" || producto.Nombre == "" || producto.Categoria == "" {
			return nil, &errores.Datos{Mensaje: fmt.Sprintf("El archivo '%s' tiene un producto con campos inválidos.", ruta)}
		}
		if producto.PrecioUnitario < 0 {
			return nil, &errores.Datos{Mensaje: fmt.Sprintf("El producto '%s' tiene un precio negativo.", producto.Codigo)}
		}
		if vistos[producto.Codigo] {
			return nil, &errores.Datos{Mensaje: fmt.Sprintf("El producto '%s' está duplicado.", producto.Codigo)}
		}
		vistos[producto.Codigo] = true
	}
	return archivo.Productos, nil
}

// CargarPedidosIniciales carga el dataset inicial como pedidos crudos.
func CargarPedidosIniciales(directorio string) ([]json.RawMessage, error) {
	ruta := filepath.Join(directorio, "pedidos_pequenos.json")
	datos, err := os.ReadFile(ruta)
	if err != nil {
		return nil, &errores.Datos{Mensaje: fmt.Sprintf("No se pudo leer '%s': %v", ruta, err)}
	}
	return extraerPedidos(datos, ruta)
}

// CargarEntradaLote carga un lote desde archivo o entrada estándar.
// Acepta {"pedidos": [...]} o un array de pedidos.
func CargarEntradaLote(ruta string) ([]json.RawMessage, error) {
	texto, err := leerTexto(ruta)
	if err != nil {
		return nil, err
	}
	return extraerPedidos([]byte(texto), ruta)
}

func extraerPedidos(datos []byte, ruta string) ([]json.RawMessage, error) {
	var raiz json.RawMessage
	if e := json.Unmarshal(datos, &raiz); e != nil {
		return nil, &errores.Datos{Mensaje: fmt.Sprintf("La entrada '%s' no contiene JSON válido: %v", ruta, e)}
	}

	recortado := bytes.TrimSpace(raiz)
	if len(recortado) == 0 {
		return nil, &errores.Datos{Mensaje: fmt.Sprintf("La entrada '%s' está vacía.", ruta)}
	}

	switch recortado[0] {
	case '[':
		var brutos []json.RawMessage
		if e := json.Unmarshal(recortado, &brutos); e != nil {
			return nil, &errores.Datos{Mensaje: fmt.Sprintf("La entrada '%s' no contiene una lista de pedidos válida: %v", ruta, e)}
		}
		return brutos, nil
	case '{':
		var mapa map[string]json.RawMessage
		if e := json.Unmarshal(recortado, &mapa); e != nil {
			return nil, &errores.Datos{Mensaje: fmt.Sprintf("La entrada '%s' no contiene JSON válido: %v", ruta, e)}
		}
		bruto, ok := mapa["pedidos"]
		if !ok {
			return nil, &errores.Datos{
				Mensaje: "La entrada debe ser un array de pedidos o un objeto con la lista 'pedidos'.",
			}
		}
		var brutos []json.RawMessage
		if e := json.Unmarshal(bruto, &brutos); e != nil {
			return nil, &errores.Datos{
				Mensaje: "La entrada debe ser un array de pedidos o un objeto con la lista 'pedidos'.",
			}
		}
		return brutos, nil
	default:
		return nil, &errores.Datos{
			Mensaje: "La entrada debe ser un array de pedidos o un objeto con la lista 'pedidos'.",
		}
	}
}
