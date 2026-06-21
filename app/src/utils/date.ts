// Date → 'YYYY-MM-DD' (로컬 타임존 기준).
// 여러 컴포넌트에 흩어져 중복 정의돼 있던 함수를 한 곳으로 모은다.
export const toLocalDateString = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};
