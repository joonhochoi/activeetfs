// Date → 'YYYY-MM-DD' (로컬 타임존 기준).
// 여러 컴포넌트에 흩어져 중복 정의돼 있던 함수를 한 곳으로 모은다.
export const toLocalDateString = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// 데이터가 있는 날짜 목록(오름차순)에서 target 이하의 가장 가까운 날짜로 스냅한다.
// target 이전 데이터가 없으면 가장 이른 날짜를 반환한다. 목록이 비면 null.
// 주말·공휴일·미수집일을 선택해도 가장 가까운 실제 데이터일로 자동 보정하는 데 쓴다.
export const snapToAvailableDate = (
    target: string,
    availableDatesSorted: string[],
): string | null => {
    if (availableDatesSorted.length === 0) return null;
    let snapped = availableDatesSorted[0];
    for (const d of availableDatesSorted) {
        if (d <= target) snapped = d;
        else break;
    }
    return snapped;
};
