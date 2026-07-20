// 引擎共享常量
// 将杀分数上界：实际将杀分数为 ±(MATE_SCORE - distanceToMate)
export const MATE_SCORE = 100000;
// 将杀分数判定阈值：|score| > MATE_SCORE - MATE_THRESHOLD 视为将杀
export const MATE_THRESHOLD = 1000;
