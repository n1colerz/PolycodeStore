// Package cli implementa los subcomandos `run` y `serve` de la herramienta.
package cli

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"polystore/internal/almacen"
	"polystore/internal/api"
	"polystore/internal/concurrencia"
	"polystore/internal/iojson"
	"polystore/internal/modelos"
	"polystore/internal/reglas"
)

const (
	puertoPorDefecto = 8002
	hostPorDefecto   = "127.0.0.1"
)

// Run ejecuta la CLI y devuelve el código de salida.
func Run(args []string) int {
	if len(args) == 0 {
		imprimirAyuda(os.Stderr)
		return 2
	}

	switch args[0] {
	case "run":
		return ejecutarRun(args[1:])
	case "serve":
		return ejecutarServe(args[1:])
	case "--version", "-version", "version":
		fmt.Println(modelos.Version)
		return 0
	case "--help", "-h", "help":
		imprimirAyuda(os.Stdout)
		return 0
	default:
		fmt.Fprintf(os.Stderr, "Comando desconocido: %s\n", args[0])
		imprimirAyuda(os.Stderr)
		return 2
	}
}

func imprimirAyuda(salida io.Writer) {
	fmt.Fprintln(salida, "Uso: go run ./cmd <comando> [opciones]")
	fmt.Fprintln(salida, "")
	fmt.Fprintln(salida, "Comandos:")
	fmt.Fprintln(salida, "  run    procesa un JSON de pedidos en lote y escribe el resultado")
	fmt.Fprintln(salida, "  serve  levanta la API HTTP")
	fmt.Fprintln(salida, "")
	fmt.Fprintln(salida, "Opciones de run:")
	fmt.Fprintln(salida, "  --entrada <archivo|->   archivo JSON de pedidos (o '-' para stdin)")
	fmt.Fprintln(salida, "  --salida <archivo|->    archivo JSON de salida (o '-' para stdout)")
	fmt.Fprintln(salida, "  --datos <directorio>    directorio con clientes.json")
	fmt.Fprintln(salida, "  --trabajadores <n>      goroutines del lote")
	fmt.Fprintln(salida, "")
	fmt.Fprintln(salida, "Opciones de serve:")
	fmt.Fprintln(salida, "  --datos <directorio>    directorio con los datasets")
	fmt.Fprintln(salida, "  --host <host>           host de escucha (default 127.0.0.1)")
	fmt.Fprintln(salida, "  --puerto <n>            puerto (default GO_PORT u 8002)")
	fmt.Fprintln(salida, "")
	fmt.Fprintln(salida, "Variables de entorno: GO_PORT, POLY_DATA_DIR, POLY_WORKERS")
}

func directorioDatos(valor string) string {
	if valor != "" {
		return valor
	}
	if desdeEntorno := os.Getenv("POLY_DATA_DIR"); desdeEntorno != "" {
		return desdeEntorno
	}
	return "datos"
}

func resolverPuerto(valor int) (int, error) {
	if valor > 0 {
		return valor, nil
	}
	desdeEntorno := os.Getenv("GO_PORT")
	if desdeEntorno != "" {
		numero, err := strconv.Atoi(desdeEntorno)
		if err != nil {
			return 0, fmt.Errorf("La variable GO_PORT debe ser un número entero, no '%s'", desdeEntorno)
		}
		return numero, nil
	}
	return puertoPorDefecto, nil
}

func ejecutarRun(args []string) int {
	conjunto := flag.NewFlagSet("run", flag.ContinueOnError)
	conjunto.SetOutput(io.Discard)
	entrada := conjunto.String("entrada", "", "archivo JSON de pedidos o '-' para stdin")
	salida := conjunto.String("salida", "", "archivo JSON de salida o '-' para stdout")
	datos := conjunto.String("datos", "", "directorio con clientes.json")
	trabajadores := conjunto.Int("trabajadores", 0, "goroutines del lote")

	if e := conjunto.Parse(args); e != nil {
		fmt.Fprintln(os.Stderr, "Error: argumentos inválidos para 'run'.")
		return 2
	}
	if *entrada == "" {
		fmt.Fprintln(os.Stderr, "Error: falta el argumento --entrada.")
		return 2
	}

	directorio := directorioDatos(*datos)
	clientes, err := iojson.CargarClientes(directorio)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		return 1
	}
	brutos, err := iojson.CargarEntradaLote(*entrada)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		return 1
	}

	catalogo := reglas.Catalogo{Clientes: clientes}
	lote, errLote := concurrencia.ProcesarLote(brutos, catalogo, numeroTrabajadores(*trabajadores))
	if errLote != nil {
		fmt.Fprintf(os.Stderr, "Error: %s\n", errLote.Mensaje)
		return 1
	}

	if *salida != "" && *salida != "-" {
		if e := iojson.EscribirJSON(*salida, lote); e != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", e)
			return 1
		}
		return 0
	}

	texto, e := iojson.SerializarJSON(lote)
	if e != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", e)
		return 1
	}
	os.Stdout.WriteString(texto)
	return 0
}

// numeroTrabajadores devuelve el número de workers explícito o el valor por defecto.
func numeroTrabajadores(trabajadores int) int {
	if trabajadores > 0 {
		return trabajadores
	}
	return concurrencia.TrabajadoresPorDefecto()
}

func ejecutarServe(args []string) int {
	conjunto := flag.NewFlagSet("serve", flag.ContinueOnError)
	conjunto.SetOutput(io.Discard)
	datos := conjunto.String("datos", "", "directorio con los datasets")
	host := conjunto.String("host", hostPorDefecto, "host de escucha")
	puerto := conjunto.Int("puerto", 0, "puerto de escucha")

	if e := conjunto.Parse(args); e != nil {
		fmt.Fprintln(os.Stderr, "Error: argumentos inválidos para 'serve'.")
		return 2
	}

	directorio := directorioDatos(*datos)
	clientes, err := iojson.CargarClientes(directorio)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error al iniciar la API: %v\n", err)
		return 1
	}
	// productos.json se carga para validar el dataset; las reglas no validan
	// codigoProducto contra el catalogo (decisión D12 del contrato).
	productos, err := iojson.CargarProductos(directorio)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error al iniciar la API: %v\n", err)
		return 1
	}
	brutos, err := iojson.CargarPedidosIniciales(directorio)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error al iniciar la API: %v\n", err)
		return 1
	}

	catalogo := reglas.Catalogo{Clientes: clientes, Productos: productos}
	pedidos := make([]modelos.Pedido, 0, len(brutos))
	for _, bruto := range brutos {
		var mapa map[string]json.RawMessage
		if e := json.Unmarshal(bruto, &mapa); e != nil {
			fmt.Fprintf(os.Stderr, "Error al iniciar la API: el dataset no es válido.\n")
			return 1
		}
		pedido, e := reglas.ValidarPedido(mapa, catalogo)
		if e != nil {
			fmt.Fprintf(os.Stderr, "Error al iniciar la API: %s\n", e.Mensaje)
			return 1
		}
		pedidos = append(pedidos, pedido)
	}

	almacenPedidos, err := almacen.Nuevo(pedidos, clientes)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error al iniciar la API: %v\n", err)
		return 1
	}

	numero, err := resolverPuerto(*puerto)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error al iniciar la API: %v\n", err)
		return 1
	}

	servidor := api.NuevoServidor(almacenPedidos, catalogo, "go")
	httpServidor := &http.Server{
		Addr:              fmt.Sprintf("%s:%d", *host, numero),
		Handler:           servidor.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
	}

	rutaAbsoluta, _ := filepath.Abs(directorio)
	fmt.Fprintf(os.Stderr, "API Go escuchando en http://%s:%d (datos: %s)\n", *host, numero, rutaAbsoluta)

	if e := httpServidor.ListenAndServe(); e != nil {
		fmt.Fprintf(os.Stderr, "Error al iniciar la API: %v\n", e)
		return 1
	}
	return 0
}
