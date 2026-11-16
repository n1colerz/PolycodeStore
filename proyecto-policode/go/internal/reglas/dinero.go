package reglas

import (
	"encoding/json"
	"math/big"
)

// redondearEntero redondea un racional a entero con la regla half-up,
// equivalente al ROUND_HALF_UP de Python sobre Decimal.
func redondearEntero(valor *big.Rat) int64 {
	if valor == nil || valor.Sign() == 0 {
		return 0
	}
	if valor.Sign() < 0 {
		return -redondearEntero(new(big.Rat).Neg(valor))
	}
	mitad := new(big.Rat).Add(valor, big.NewRat(1, 2))
	return new(big.Int).Quo(mitad.Num(), mitad.Denom()).Int64()
}

// redondearACentavos convierte un importe en unidades monetarias a centavos
// enteros aplicando redondeo half-up a dos decimales.
func redondearACentavos(unidades *big.Rat) int64 {
	if unidades == nil {
		return 0
	}
	return redondearEntero(new(big.Rat).Mul(unidades, big.NewRat(100, 1)))
}

// unidadesDesdeCentavos convierte centavos a unidades exactas.
func unidadesDesdeCentavos(centavos int64) *big.Rat {
	return new(big.Rat).Quo(ratDesdeCentavos(centavos), big.NewRat(100, 1))
}

// ratDesdeCentavos representa un importe entero como racional exacto.
func ratDesdeCentavos(centavos int64) *big.Rat {
	return new(big.Rat).SetInt64(centavos)
}

// ratDesdeNumero convierte un número JSON en racional exacto (decimal literal).
func ratDesdeNumero(numero json.Number) (*big.Rat, bool) {
	racional, ok := new(big.Rat).SetString(numero.String())
	if !ok {
		return nil, false
	}
	return racional, true
}

// floatDesdeCentavos convierte centavos a el número JSON del contrato.
func floatDesdeCentavos(centavos int64) float64 {
	return float64(centavos) / 100
}
