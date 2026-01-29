package main

import (
	"activeetf-sidecar/pkg/scraper"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
)

var debugFlag bool

type KoActResponse struct {
	Pdf KoActPdf `json:"pdf"`
}

type KoActPdf struct {
	GijunYMD            string       `json:"gijunYMD"`
	TotalCnt            int          `json:"totalCnt"`
	PdfExcelDownloadUrl string       `json:"pdfExcelDownloadUrl"`
	NowCnt              int          `json:"nowCnt"`
	List                []KoActAsset `json:"list"`
}

type KoActAsset struct {
	Risep    string `json:"risep"`
	TotalCnt string `json:"totalCnt"`
	SecNm    string `json:"secNm"`
	EvalA    string `json:"evalA"`
	BasrpRt  string `json:"basrpRt"`
	ApplyQ   string `json:"applyQ"`
	ItmNo    string `json:"itmNo"`
	Curp     string `json:"curp"`
	Ratio    string `json:"ratio"`
	PdfType  string `json:"pdfType"`
}

func main() {
	flag.Usage = func() {}
	df := flag.Bool("debug", false, "Enable debug mode")
	// Parse CLI arguments
	typeParam := flag.String("type", "KoAct", "ETF Type (e.g. KODEX,KoAct)")
	idParam := flag.String("id", "", "ETF Id (e.g. 2ETFJ9)")
	codeParam := flag.String("code", "", "ETF Code")
	dateParam := flag.String("date", "", "Target Date (YYYY-MM-DD)")
	flag.Parse()

	debugFlag = *df

	if *idParam == "" || *codeParam == "" {
		scraper.Output([]scraper.Holding{})
		return
	}

	targetDate := *dateParam
	if targetDate == "" {
		targetDate = time.Now().Format("2006-01-02") // Default to today
	}

	// API expects YYYYMMDD for gijunYMD
	cleanDate := strings.ReplaceAll(targetDate, "-", "")

	var callUrl string
	if *typeParam == "KODEX" {
		callUrl = fmt.Sprintf("https://www.samsungfund.co.kr/api/v1/kodex/product-pdf/%s.do?gijunYMD=%s", *idParam, cleanDate)
	} else {
		callUrl = fmt.Sprintf("https://www.samsungactive.co.kr/api/v1/product/etf-pdf/%s.do?gijunYMD=%s", *idParam, cleanDate)
	}

	if debugFlag {
		fmt.Printf("Fetching holdings from: %s\n", callUrl)
	}

	if v, err := getHoldings(callUrl, targetDate, *codeParam); err != nil {
		scraper.ErrorOutput(err)
		return
	} else {
		scraper.Output(v)
	}
}

func getHoldings(url string, date string, etfCode string) ([]scraper.Holding, error) {
	client := &http.Client{Timeout: 30 * time.Second}
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")

	res, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()

	if res.StatusCode != 200 {
		return nil, fmt.Errorf("bad status: %d", res.StatusCode)
	}

	body, err := io.ReadAll(res.Body)
	if err != nil {
		return nil, err
	}

	var response KoActResponse
	if err := json.Unmarshal(body, &response); err != nil {
		return nil, err
	}

	var holdings []scraper.Holding
	for _, item := range response.Pdf.List {
		qty, _ := strconv.ParseInt(item.ApplyQ, 10, 64)
		price, _ := strconv.ParseFloat(item.EvalA, 64)
		weight, _ := strconv.ParseFloat(item.Ratio, 64)

		holdings = append(holdings, scraper.Holding{
			Date:      date,
			EtfCode:   etfCode,
			StockCode: item.ItmNo,
			Name:      item.SecNm,
			Weight:    weight,
			Quantity:  qty,
			Price:     price,
		})
	}

	return holdings, nil
}
