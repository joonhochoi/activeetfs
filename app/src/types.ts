export interface Holding {
    date: string;
    etf_code: string;
    stock_code: string;
    name: string;
    weight: number;
    quantity: number;
    price?: number;
}

export interface AnalysisResult {
    added: Holding[];
    removed: Holding[];
    changed: Holding[];
}

export interface EtfInfo {
    code: string;
    name: string;
    args: string[];
}

export interface ManagerInfo {
    id: string;
    name: string;
    code: string;
    sidecar_exe: string;
    etfs: EtfInfo[];
}

export interface Config {
    managers: ManagerInfo[];
}
