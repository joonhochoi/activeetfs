// 두 시점의 보유 종목을 stock_code(종목코드) 기준으로 비교해
// 편입(added: curr에만 존재)과 편출(removed: prev에만 존재)을 구한다.
// 종목명은 표기가 바뀔 수 있으므로 반드시 코드로 비교한다(리뷰 1-2 참고).
export function diffByStockCode<T extends { stock_code: string }>(
    prev: T[],
    curr: T[],
): { added: T[]; removed: T[] } {
    const prevCodes = new Set(prev.map(h => h.stock_code));
    const currCodes = new Set(curr.map(h => h.stock_code));
    return {
        added: curr.filter(h => !prevCodes.has(h.stock_code)),
        removed: prev.filter(h => !currCodes.has(h.stock_code)),
    };
}
