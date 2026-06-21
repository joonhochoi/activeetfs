import { invoke } from '@tauri-apps/api/core';
import activeEtfInfosRaw from '../data/activeetfinfos.json';
import { Config, ManagerInfo, EtfInfo } from '../types';

// JSON 임포트를 카탈로그 타입으로 한 번만 단언해, 이하에서는 정확한 타입으로 다룬다.
const activeEtfInfos = activeEtfInfosRaw as unknown as Config;

// 데이터 수집/표시에 필요한 ETF 정보를 한 형태로 정규화한 타입.
// 정적 카탈로그(activeetfinfos.json)와 사용자 추가 ETF(DB) 양쪽을 모두 표현한다.
export interface ResolvedEtf {
    code: string;
    name: string;
    provider: string;   // get_etf_holdings 분기 키 (= manager.type)
    id: string;         // 운용사별 상품 ID (etf_id)
    managerId: string;
    managerName: string;
    viewUrl?: string;
    isUserAdded: boolean;
}

// get_user_added_etfs 응답 형태
export interface UserEtf {
    code: string;
    name: string;
    managerId: string;
    etfId: string;
}

// manager_id → provider(type) 매핑. timefolio처럼 id와 type이 다른 경우를 흡수한다.
function managerByIdOrType(managerId: string): ManagerInfo | undefined {
    return activeEtfInfos.managers.find(
        m => m.id === managerId || m.type === managerId,
    );
}

// 사용자 추가 ETF 한 건을 ResolvedEtf로 변환
function fromUserEtf(ue: UserEtf): ResolvedEtf {
    const manager = managerByIdOrType(ue.managerId);
    return {
        code: ue.code,
        name: ue.name,
        provider: manager?.type ?? ue.managerId,
        id: ue.etfId,
        managerId: ue.managerId,
        managerName: manager?.name ?? ue.managerId,
        viewUrl: manager?.view_url,
        isUserAdded: true,
    };
}

// 카탈로그 ETF 한 건을 ResolvedEtf로 변환
function fromCatalog(manager: ManagerInfo, etf: EtfInfo): ResolvedEtf {
    return {
        code: etf.code,
        name: etf.name,
        provider: manager.type,
        id: etf.id,
        managerId: manager.id,
        managerName: manager.name,
        viewUrl: manager.view_url,
        isUserAdded: false,
    };
}

// 특정 etfCode에 대한 수집 대상 정보를 해석한다. 카탈로그 우선, 없으면 사용자 추가 목록에서 탐색.
export function resolveEtf(etfCode: string, userEtfs: UserEtf[]): ResolvedEtf | null {
    for (const manager of activeEtfInfos.managers) {
        const etf = manager.etfs.find(e => e.code === etfCode);
        if (etf) return fromCatalog(manager, etf);
    }
    const ue = userEtfs.find(u => u.code === etfCode);
    return ue ? fromUserEtf(ue) : null;
}

// 사용자 추가 ETF 목록을 안전하게 가져온다(실패 시 빈 배열).
export async function fetchUserEtfs(): Promise<UserEtf[]> {
    try {
        return await invoke<UserEtf[]>('get_user_added_etfs');
    } catch {
        return [];
    }
}

// 일괄 수집 시 ETF 간 대기 시간(ms).
// WebView로 Cloudflare를 통과하는 koact/kodex는 세션 안정화를 위해 길게 두고,
// 일반 HTTP API 운용사는 짧게 둬서 전체 소요 시간을 줄인다.
export function interEtfDelayMs(provider: string): number {
    const p = provider.toLowerCase();
    return p === 'koact' || p === 'kodex' ? 400 : 120;
}

// 일괄 업데이트 대상: 카탈로그 + 사용자 추가 ETF를 모두 합친 목록을 반환한다.
export async function getAllEtfTargets(): Promise<ResolvedEtf[]> {
    const userEtfs = await fetchUserEtfs();
    const list: ResolvedEtf[] = [];
    for (const manager of activeEtfInfos.managers) {
        for (const etf of manager.etfs) {
            list.push(fromCatalog(manager, etf));
        }
    }
    for (const ue of userEtfs) {
        list.push(fromUserEtf(ue));
    }
    return list;
}
