package main

import (
	"activeetf-sidecar/pkg/scraper"
	"flag"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/PuerkitoBio/goquery"
)

var debugFlag bool

func main() {
	flag.Usage = func() {}
	df := flag.Bool("debug", false, "Enable debug mode")
	// Parse CLI arguments
	idxParam := flag.Int("idx", 0, "ETF Index")
	codeParam := flag.String("code", "", "ETF Code")
	dateParam := flag.String("date", "", "Target Date (YYYY-MM-DD)")
	flag.Parse()

	debugFlag = *df

	if *idxParam == 0 || *codeParam == "" {
		// Return empty list if no idx
		scraper.Output([]scraper.Holding{})
		return
	}

	targetDate := *dateParam
	if targetDate == "" {
		targetDate = time.Now().Format("2006-01-02") // Default to today
	}

	callUrl := fmt.Sprintf("https://timeetf.co.kr/m11_view.php?idx=%d&cate=&pdfDate=%s", *idxParam, targetDate)

	if debugFlag {
		fmt.Printf("Fetching holdings from: %s\n", callUrl)
	}

	// holdings := []scraper.Holding{
	// 	{
	// 		Date:      targetDate,
	// 		EtfCode:   *codeParam,
	// 		StockCode: "005930",
	// 		Name:      "Samsung Electronics",
	// 		Weight:    25.5,
	// 		Quantity:  1000,
	// 	},
	// 	{
	// 		Date:      targetDate,
	// 		EtfCode:   *codeParam,
	// 		StockCode: "000660",
	// 		Name:      "SK Hynix",
	// 		Weight:    15.2,
	// 		Quantity:  500,
	// 	},
	// }
	if v, err := getHoldings(callUrl, targetDate, *codeParam); err != nil {
		scraper.ErrorOutput(err)
		return
	} else {
		scraper.Output(v)
	}
}

func getHoldings(etfURL string, targetDate string, etfCode string) ([]scraper.Holding, error) {
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
