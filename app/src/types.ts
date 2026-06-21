export interface Holding {
    date: string;
    etf_code: string;
    stock_code: string;
    name: string;
    weight: number;
    quantity: number;
    price?: number;
}

// activeetfinfos.json 카탈로그 구조에 대응하는 타입.
export interface EtfInfo {
    code: string;   // 종목코드
    name: string;   // 표시 이름
    id: string;     // 운용사별 상품 ID (데이터 수집에 사용)
}

export interface ManagerInfo {
    id: string;        // 운용사 ID
    name: string;      // 운용사 표시명
    type: string;      // provider 키 (get_etf_holdings 분기, 예: time/koact/...)
    view_url: string;  // 상품 페이지 URL 템플릿({$} 자리표시자)
    etfs: EtfInfo[];
}

export interface Config {
    managers: ManagerInfo[];
}
