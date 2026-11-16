// Comando principal de la implementación Go de proyecto-polycode.
package main

import (
	"os"

	"polystore/internal/cli"
)

func main() {
	os.Exit(cli.Run(os.Args[1:]))
}
