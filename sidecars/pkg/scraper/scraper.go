package scraper

import (
	"encoding/json"
	"fmt"
	"os"
)

// Holding represents a single stock holding in an ETF
type Holding struct {
	Date      string  `json:"date"`
	EtfCode   string  `json:"etf_code"`
	StockCode string  `json:"stock_code"`
	Name      string  `json:"name"`
	Weight    float64 `json:"weight"`   // 비중
	Quantity  int64   `json:"quantity"` // 수량
	Price     float64 `json:"price"`    // 가격
}

// Output writes the holdings to stdout as JSON
func Output(holdings []Holding) {
	enc := json.NewEncoder(os.Stdout)
	// enc.SetIndent("", "  ") // Indentation can break some parsers if they expect single line, but JSON decoder is usually fine.
	// We will output compact JSON for efficiency and strictly one JSON object per execution if possible.
	_ = enc.Encode(holdings)
}

// ErrorOutput writes an error to stderr (Tauri captures stderr too)
func ErrorOutput(err error) {
	fmt.Fprintf(os.Stderr, "Error: %v\n", err)
}
