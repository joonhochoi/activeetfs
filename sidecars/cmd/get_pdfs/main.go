package main

import (
	"activeetf-sidecar/pkg/scraper"
	"flag"
	"io"

	"encoding/json"
	"fmt"

	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/PuerkitoBio/goquery"
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

type PlusEtfResponse struct {
	Content       []PlusEtfItem `json:"content"`
	TotalPages    int           `json:"totalPages"`
	TotalElements int           `json:"totalElements"`
	Last          bool          `json:"last"`
	First         bool          `json:"first"`
}

type PlusEtfItem struct {
	Num    int     `json:"num"`
	WkDate string  `json:"wkdate"`
	KrJmCd string  `json:"krJmCd"`
	JmNm   string  `json:"jmNm"`
	Amount float64 `json:"amount"` // 수량
	Ratio  float64 `json:"ratio"`  // 비율
}

var gSubparam1 string

func main() {
	// // Write args to extensive debug log file
	// f, _ := os.OpenFile("sidecar_debug.log", os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	// if f != nil {
	// 	fmt.Fprintf(f, "[%s] Args: %v\n", time.Now().Format(time.RFC3339), os.Args)
	// 	f.Close()
	// }
	flag.Usage = func() {}
	df := flag.Bool("debug", false, "Enable debug mode")
	// Parse CLI arguments
	typeParam := flag.String("type", "koact", "ETF Type (e.g. time,koact,kodex,rise,plus)")
	idParam := flag.String("id", "", "ETF Id (e.g. 2ETFJ9)")
	codeParam := flag.String("code", "", "ETF Code")
	dateParam := flag.String("date", "", "Target Date (YYYY-MM-DD)")
	flag.Parse()

	debugFlag = *df

	if *idParam == "" || *codeParam == "" {
		//scraper.Output([]scraper.Holding{})
		return // 그냥 종료
	}

	targetDate := *dateParam
	if targetDate == "" {
		targetDate = time.Now().Format("2006-01-02") // Default to today
	}

	// API expects YYYYMMDD for gijunYMD
	cleanDate := strings.ReplaceAll(targetDate, "-", "")

	var callUrl string
	var callFunc func(url string, date string, etfCode string) ([]scraper.Holding, error)
	switch strings.ToLower(*typeParam) {
	case "kodex": // koact 의 파생
		callUrl = fmt.Sprintf("https://www.samsungfund.com/api/v1/kodex/product-pdf/%s.do?gijunYMD=%s", *idParam, cleanDate)
		callFunc = getKoactHoldings
	case "koact": // json방식임
		callUrl = fmt.Sprintf("https://www.samsungactive.co.kr/api/v1/product/etf-pdf/%s.do?gijunYMD=%s", *idParam, cleanDate)
		callFunc = getKoactHoldings
	case "rise": // html이 넘어옴
		callUrl = "https://www.riseetf.co.kr/prod/finder/productViewSearchTabJquery3"
		callFunc = getRISEHoldings
		gSubparam1 = *idParam
	case "plus":
		callUrl = fmt.Sprintf("https://www.plusetf.co.kr/api/v1/product/pdf/list?n=%s&page=0&d=%s&pageSize=10", *idParam, cleanDate)
		callFunc = getPLUSHoldings
	case "time": // 상품 웹을 분석해야함
		callUrl = fmt.Sprintf("https://timeetf.co.kr/m11_view.php?idx=%s&cate=&pdfDate=%s", *idParam, targetDate)
		callFunc = getTIMEHoldings
	default:
		scraper.ErrorOutput(fmt.Errorf("Unknown ETF Type: %s\n", *typeParam))
		return
	}

	if debugFlag {
		fmt.Printf("Fetching holdings from: %s\n", callUrl)
	}

	if v, err := callFunc(callUrl, targetDate, *codeParam); err != nil {
		scraper.ErrorOutput(err)
		return
	} else {
		scraper.Output(v)
	}
}

func getPLUSHoldings(urlStr string, date string, etfCode string) ([]scraper.Holding, error) {
	// Parse base URL to modify query params easily
	u, err := url.Parse(urlStr)
	if err != nil {
		return nil, err
	}

	client := &http.Client{Timeout: 30 * time.Second}
	var holdings []scraper.Holding

	// Initial pagination state
	page := 0
	totalPages := 1 // Assume at least one page to start loop

	for page < totalPages {
		// Set current page
		q := u.Query()
		q.Set("page", strconv.Itoa(page))
		u.RawQuery = q.Encode()

		req, err := http.NewRequest("GET", u.String(), nil)
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
			res.Body.Close()
			return nil, fmt.Errorf("bad status: %d (page %d)", res.StatusCode, page)
		}

		body, err := io.ReadAll(res.Body)
		res.Body.Close() // Close immediately after reading
		if err != nil {
			return nil, err
		}

		var response PlusEtfResponse
		if err := json.Unmarshal(body, &response); err != nil {
			return nil, err
		}

		// Update total pages from first response
		if page == 0 {
			totalPages = response.TotalPages
			if totalPages == 0 && len(response.Content) > 0 {
				// Fallback if totalPages is 0 but we have content (single page?)
				totalPages = 1
			}
		}

		for _, item := range response.Content {
			// Convert float amount to int64 for Quantity if appropriate.
			// Using int64(amount) implies truncation.
			qty := int64(item.Amount)
			weight := item.Ratio
			// Price is not explicitly provided in the known JSON, default to 0.

			holdings = append(holdings, scraper.Holding{
				Date:      date,
				EtfCode:   etfCode,
				StockCode: item.KrJmCd,
				Name:      item.JmNm,
				Weight:    weight,
				Quantity:  qty,
				Price:     0, // Price info missing in JSON
			})
		}

		page++
		// Small delay to be polite if many pages
		if totalPages > 5 {
			time.Sleep(1000 * time.Millisecond)
		}
		time.Sleep(500 * time.Millisecond)
	}

	return holdings, nil
}

func getRISEHoldings(callUrl string, date string, etfCode string) ([]scraper.Holding, error) {
	// POST request with form data
	formData := url.Values{}
	formData.Set("searchDate", date)
	formData.Set("fundCd", gSubparam1)

	client := &http.Client{Timeout: 30 * time.Second}
	req, err := http.NewRequest("POST", callUrl, strings.NewReader(formData.Encode()))
	if err != nil {
		return nil, err
	}

	// POST /prod/finder/productViewSearchTabJquery3 HTTP/1.1
	// Accept: */*
	// Accept-Encoding: gzip, deflate, br, zstd
	// Accept-Language: ko,en-US;q=0.9,en;q=0.8,ja;q=0.7,zh-CN;q=0.6,zh;q=0.5
	// Cache-Control: no-cache
	// Connection: keep-alive
	// Content-Length: 33
	// Content-Type: application/x-www-form-urlencoded; charset=UTF-8
	// Cookie: ETF_SESSIONID1=aa6b6333-3980-43f6-870b-c7f315136b4c; JSESSIONID=3lbTbkEI6gEv1Wa61MAfikKI6PNUZciGfCnKMEGhcIX5XnBltxcpE3Jrr6aLDin8.amV1c19kb21haW4vZXRm
	// Host: www.riseetf.co.kr
	// Origin: https://www.riseetf.co.kr
	// Pragma: no-cache
	// Referer: https://www.riseetf.co.kr/prod/finderDetail/44K0?searchFlag=viewtab3
	// Sec-Fetch-Dest: empty
	// Sec-Fetch-Mode: cors
	// Sec-Fetch-Site: same-origin
	// User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36
	// X-Requested-With: XMLHttpRequest
	// sec-ch-ua: "Not(A:Brand";v="8", "Chromium";v="144", "Google Chrome";v="144"
	// sec-ch-ua-mobile: ?0
	// sec-ch-ua-platform: "Windows"

	req.Header.Set("Host", "www.riseetf.co.kr")
	req.Header.Set("Origin", "https://www.riseetf.co.kr")
	req.Header.Set("Referer", fmt.Sprintf("https://www.riseetf.co.kr/prod/finderDetail/%s?searchFlag=viewtab3", gSubparam1))
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36")
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8")
	req.Header.Set("Accept", "*/*")
	req.Header.Set("Accept-Language", "ko,en-US;q=0.9,en;q=0.8,ja;q=0.7,zh-CN;q=0.6,zh;q=0.5")
	req.Header.Set("X-Requested-With", "XMLHttpRequest")
	req.Header.Set("Cache-Control", "no-cache")
	req.Header.Set("Pragma", "no-cache")
	req.Header.Set("Connection", "keep-alive")
	req.Header.Set("Sec-Fetch-Dest", "empty")
	req.Header.Set("Sec-Fetch-Mode", "cors")
	req.Header.Set("Sec-Fetch-Site", "same-origin")

	res, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()

	if res.StatusCode != 200 {
		return nil, fmt.Errorf("bad status: %d", res.StatusCode)
	}

	bodyBytes, err := io.ReadAll(res.Body)
	if err != nil {
		return nil, err
	}

	// The response is an HTML fragment (tr tags only), which goquery/net/html
	// might strip if strictly parsed as a document. Wrapping in <table> helps.
	htmlContent := "<table>" + string(bodyBytes) + "</table>"

	doc, err := goquery.NewDocumentFromReader(strings.NewReader(htmlContent))
	if err != nil {
		return nil, err
	}

	var holdings []scraper.Holding

	doc.Find("tr").Each(func(i int, s *goquery.Selection) {
		// Expecting at least 6 cells (th or td)
		// 0: No (th)
		// 1: Name (td)
		// 2: StockCode (td)
		// 3: Quantity (td)
		// 4: Weight (td)
		// 5: Price (td)

		// Find all child cells (th or td)
		cells := s.Find("th, td")
		if cells.Length() < 6 {
			return
		}

		name := strings.TrimSpace(cells.Eq(1).Text())
		stockCode := strings.TrimSpace(cells.Eq(2).Text())

		qtyStr := strings.ReplaceAll(strings.TrimSpace(cells.Eq(3).Text()), ",", "")
		weightStr := strings.TrimSpace(cells.Eq(4).Text())
		priceStr := strings.ReplaceAll(strings.TrimSpace(cells.Eq(5).Text()), ",", "")

		// Skip header row if it contains text like "종목명" or empty values
		if name == "종목명" || stockCode == "" {
			return
		}

		qty, _ := strconv.ParseInt(qtyStr, 10, 64)
		weight, _ := strconv.ParseFloat(weightStr, 64)
		price, _ := strconv.ParseFloat(priceStr, 64)

		holdings = append(holdings, scraper.Holding{
			Date:      date,
			EtfCode:   etfCode,
			StockCode: stockCode,
			Name:      name,
			Weight:    weight,
			Quantity:  qty,
			Price:     price,
		})
	})

	return holdings, nil
}

func getKoactHoldings(url string, date string, etfCode string) ([]scraper.Holding, error) {
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

func getTIMEHoldings(etfURL string, targetDate string, etfCode string) ([]scraper.Holding, error) {
	//fmt.Printf("Fetching holdings from: %s\n", etfURL)

	client := &http.Client{Timeout: 30 * time.Second}
	req, err := http.NewRequest("GET", etfURL, nil)
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

	doc, err := goquery.NewDocumentFromReader(res.Body)
	if err != nil {
		return nil, err
	}

	// etf code 확인
	eCode := doc.Find(".prdNum span").First().Text()
	eCode = strings.TrimSpace(eCode)
	if etfCode != eCode {
		return nil, fmt.Errorf("etf code mismatch: expected %s, got %s", etfCode, eCode)
	}

	var holdings []scraper.Holding

	// Table selector based on inspection: .table3.moreList1
	// The table structure:
	// <thead> <tr> <th>종목코드</th> ... </tr> </thead>
	// <tbody> <tr> <td>code</td> <td>name</td> <td>qty</td> <td>val</td> <td>weight</td> </tr> ... </tbody>
	doc.Find("table.moreList1 tbody tr").Each(func(i int, s *goquery.Selection) {
		tds := s.Find("td")
		// Need at least 5 columns
		if tds.Length() < 5 {
			return
		}

		code := strings.TrimSpace(tds.Eq(0).Text())
		name := strings.TrimSpace(tds.Eq(1).Text())
		qtyStr := strings.ReplaceAll(strings.TrimSpace(tds.Eq(2).Text()), ",", "")
		amtStr := strings.ReplaceAll(strings.TrimSpace(tds.Eq(3).Text()), ",", "")    // Value
		weightStr := strings.ReplaceAll(strings.TrimSpace(tds.Eq(4).Text()), "%", "") // Weight

		var shares int64
		fmt.Sscanf(qtyStr, "%d", &shares)

		var weight float64
		fmt.Sscanf(weightStr, "%f", &weight)

		var price float64
		fmt.Sscanf(amtStr, "%f", &price)

		holdings = append(holdings, scraper.Holding{
			Date:      targetDate,
			EtfCode:   etfCode,
			StockCode: code,
			Name:      name,
			Weight:    weight,
			Quantity:  shares,
			Price:     price,
		})
	})

	//tf.Printf("Successfully parsed %d holdings from %s\n", len(holdings), etfURL)
	// Debug print first few
	// for i, h := range holdings {
	// 	if i >= 5 {
	// 		break
	// 	}
	// 	tf.Printf("  [%s] %s (Shares: %d, Weight: %.2f%%)\n", h.StockCode, h.StockName, h.Shares, h.Weight)
	// }

	return holdings, nil
}
