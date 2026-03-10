import React, { useEffect, useState, useRef, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { openUrl } from '@tauri-apps/plugin-opener';
import { Holding } from '../types';
import activeEtfInfos from '../data/activeetfinfos.json';
import HoldingsTable from './HoldingsTable';

interface DashboardProps {
    etfCode: string;
    setRightPanelContent?: (content: React.ReactNode) => void;
    favorites?: Set<string>;
    onToggleFavorite?: (etfCode: string) => void;
}

interface LogItem {
    time: string;
    type: 'info' | 'success' | 'error' | 'analysis';
    message: string;
    analysisData?: {
        range: string;
        inList: { name: string; display: string }[];
        outList: { name: string; display: string }[];
    };
}

const COLOR_PALETTE = ['#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de', '#3ba272', '#fc8452', '#9a60b4', '#ea7ccc'];

const toLocalDateString = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const Dashboard: React.FC<DashboardProps> = ({ etfCode, setRightPanelContent, favorites, onToggleFavorite }) => {
    const [holdings, setHoldings] = useState<Holding[]>([]);
    const [loading, setLoading] = useState(false);
    const [scraping, setScraping] = useState(false);
    const [targetDate, setTargetDate] = useState<Date>(new Date());
    const [updateCandidates, setUpdateCandidates] = useState<Set<string>>(new Set());
    const [scrapeProgress, setScrapeProgress] = useState<{ current: number, total: number } | null>(null);
    const [topN, setTopN] = useState<string>('10');
    const [isExpanded, setIsExpanded] = useState<boolean>(false);
    const [splitRatio, setSplitRatio] = useState<number>(35); // Default top grid takes 35% height
    const [isDraggingSplit, setIsDraggingSplit] = useState<boolean>(false);
    // Chart Instance for Legend Interaction
    const chartRef = useRef<ReactECharts>(null);
    const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());
    const [highlightedSeries, setHighlightedSeries] = useState<string | null>(null);
    const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [initialAnimationComplete, setInitialAnimationComplete] = useState(false);

    // View Range
    const [viewStartDate, setViewStartDate] = useState<Date | null>(null);
    const [viewEndDate, setViewEndDate] = useState<Date | null>(null);
    const [availableDataDates, setAvailableDataDates] = useState<Set<string>>(new Set());

    // Right Sidebar Table Date
    const [selectedTableDate, setSelectedTableDate] = useState<string>('');
    const [comparisonDate, setComparisonDate] = useState<string>('');

    // Logs
    const [isLogsOpen, setIsLogsOpen] = useState<boolean>(true);
    const [logs, setLogs] = useState<LogItem[]>([]);
    const logsEndRef = useRef<HTMLDivElement>(null);

    const manager = activeEtfInfos.managers.find(m => m.etfs.some(e => e.code === etfCode));
    const etf = manager?.etfs.find(e => e.code === etfCode);

    const addLog = (message: string, type: 'info' | 'success' | 'error' | 'analysis' = 'info') => {
        const time = new Date().toLocaleTimeString();
        setLogs(prev => [...prev, { time, type, message }]);
    };

    // --- LOGIC MOVED UP FOR DEPENDENCY RESOLUTION ---

    // Series Names
    const seriesNames = useMemo(() => {
        if (!holdings.length) return [];
        const dates = Array.from(new Set(holdings.map(h => h.date))).sort();
        const relevantDates = dates.filter(d => {
            const dDate = new Date(d);
            if (viewStartDate && dDate < viewStartDate) return false;
            if (viewEndDate && dDate > viewEndDate) return false;
            return true;
        });
        if (relevantDates.length === 0) return [];

        // Create a map of Stock -> Max Weight in this period for sorting
        const stockMaxWeights = new Map<string, number>();

        holdings.forEach(h => {
            // Only consider holdings within the relevant date range
            if (relevantDates.includes(h.date)) {
                const currentMax = stockMaxWeights.get(h.name) || 0;
                if (h.weight > currentMax) {
                    stockMaxWeights.set(h.name, h.weight);
                }
            }
        });

        // Convert to array and sort by max weight
        const sortedStocks = Array.from(stockMaxWeights.keys())
            .sort((a, b) => (stockMaxWeights.get(b) || 0) - (stockMaxWeights.get(a) || 0));

        return sortedStocks.slice(0, parseInt(topN === 'all' ? '100' : topN));
    }, [holdings, topN, viewStartDate, viewEndDate]);

    const toggleSeries = (name: string) => {
        setHiddenSeries(prev => {
            const next = new Set(prev);
            if (next.has(name)) next.delete(name);
            else next.add(name);
            return next;
        });
    };

    const isolateSeries = (name: string) => {
        // Clear any existing timer to prevent previous highlights from clearing the new one
        if (highlightTimerRef.current) {
            clearTimeout(highlightTimerRef.current);
            highlightTimerRef.current = null;
        }

        // Toggle highlight
        if (highlightedSeries === name) {
            setHighlightedSeries(null); // Turn off
        } else {
            setHighlightedSeries(name); // Highlight this one

            // Auto-revert after animation (waits for animation to finish)
            highlightTimerRef.current = setTimeout(() => {
                setHighlightedSeries(null);
                highlightTimerRef.current = null;
            }, 1000); // Wait 1s (allows 500ms animation to complete + pause)
        }
    };

    // ------------------------------------------------

    useEffect(() => {
        // Use scrollTop instead of scrollIntoView to prevent whole page jumping
        if (logsEndRef.current && logsEndRef.current.parentElement) {
            const container = logsEndRef.current.parentElement;
            container.scrollTop = container.scrollHeight;
        }
    }, [logs, isLogsOpen]);

    // Chart Resize (Window only, simplified)
    // Chart Resize and ZRender Binding
    useEffect(() => {
        const handleResize = () => {
            chartRef.current?.getEchartsInstance().resize();
        };

        const bindClickEvent = () => {
            if (chartRef.current) {
                const instance = chartRef.current.getEchartsInstance();
                const zr = instance.getZr();

                zr.off('click');
                zr.on('click', (params: any) => {
                    const pointInPixel = [params.offsetX, params.offsetY];
                    if (instance.containPixel('grid', pointInPixel)) {
                        const pointInGrid = instance.convertFromPixel({ seriesIndex: 0 }, pointInPixel);
                        if (pointInGrid) {
                            const xIndex = pointInGrid[0];
                            const op = instance.getOption() as any;
                            const data = op?.xAxis?.[0]?.data;
                            if (data && data[xIndex]) {
                                const clickedDate = data[xIndex];
                                setTargetDate(new Date(clickedDate));
                                setSelectedTableDate(clickedDate);
                            }
                        }
                    }
                });
            }
        };

        // ResizeObserver for container to handle flex layout changes (initial load/logs toggle)
        const container = document.getElementById('chart-container');
        let resizeObserver: ResizeObserver | null = null;

        if (container) {
            resizeObserver = new ResizeObserver(() => {
                handleResize();
            });
            resizeObserver.observe(container);
        }

        window.addEventListener('resize', handleResize);

        // Delay binding to ensure chart instance/option is fully ready
        const bindTimer = setTimeout(() => {
            bindClickEvent();
            handleResize(); // Ensure size is correct too
        }, 300);

        // Initial fallback
        // const timer = setTimeout(handleResize, 100); // Replaced by bindTimer

        return () => {
            clearTimeout(bindTimer);
            if (resizeObserver) {
                resizeObserver.disconnect();
            }
            window.removeEventListener('resize', handleResize);
        };
    }, [isLogsOpen, holdings, seriesNames, highlightedSeries, viewStartDate, viewEndDate, isExpanded, splitRatio]);

    // Drag to resize split
    useEffect(() => {
        if (!isDraggingSplit) return;

        const handleMouseMove = (e: MouseEvent) => {
            const container = document.getElementById('chart-container');
            if (!container) return;
            const rect = container.getBoundingClientRect();
            // Calculate percentage from top (limit between 20% and 80%)
            let newRatio = ((e.clientY - rect.top) / rect.height) * 100;
            newRatio = Math.max(20, Math.min(80, newRatio));
            setSplitRatio(newRatio);
        };

        const handleMouseUp = () => {
            setIsDraggingSplit(false);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);

        // Prevent generic text selection while dragging
        document.body.style.userSelect = 'none';

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            document.body.style.userSelect = '';
        };
    }, [isDraggingSplit]);

    useEffect(() => {
        if (etfCode) {
            setInitialAnimationComplete(false); // Reset for new ETF

            // Clean slate for new ETF to prevent ghost data
            setHoldings([]);
            setUpdateCandidates(new Set());
            setAvailableDataDates(new Set());
            setLogs([]); // Clear logs on switch

            // Mark initial animation as done after 1.5s
            const timer = setTimeout(() => {
                setInitialAnimationComplete(true);
            }, 1500);

            loadHoldings();

            return () => clearTimeout(timer);
        }
    }, [etfCode]);

    useEffect(() => {
        const unlisten = listen('refresh-data', () => {
            console.log('Refresh data event received');
            if (etfCode) loadHoldings();
        });

        // Cleanup function needs to handle the promise returned by listen
        return () => {
            unlisten.then(f => f());
        };
    }, [etfCode]);

    // Clean up older resize-only effect logic if needed? 
    // The ZRender binding needs chartOption dependency or re-binding.
    // Let's keep the ZRender binding in the layout/resize effect for now but add chartOption dependency.

    const loadHoldings = async () => {
        setLoading(true);
        try {
            const data = await invoke<Holding[]>('get_holdings', { etfCode });
            setHoldings(data);
            if (data.length > 0) {
                // Determine available dates
                const dates = Array.from(new Set(data.map(h => h.date))).sort();
                if (dates.length > 0) {
                    const lastDate = dates[dates.length - 1];
                    setTargetDate(new Date(lastDate));
                    setSelectedTableDate(lastDate);
                    setAvailableDataDates(new Set(dates));

                    // Set default view range to recent (e.g., last 1 month)
                    setViewEndDate(new Date(lastDate));
                    if (dates.length > 0) {
                        const first = new Date(dates[0]);
                        // logic to set start date to ~1 week ago if possible, else first date
                        const oneWeekAgo = new Date(lastDate);
                        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
                        setViewStartDate(oneWeekAgo < first ? first : oneWeekAgo);
                    }
                }
            }
        } catch (error) {
            console.error(error);
            addLog(`Failed to load holdings: ${error}`, 'error');
        } finally {
            setLoading(false);
        }
    };

    const toggleCandidate = (date: Date) => {
        const dateStr = toLocalDateString(date);
        setUpdateCandidates(prev => {
            const next = new Set(prev);
            if (next.has(dateStr)) next.delete(dateStr);
            else next.add(dateStr);
            return next;
        });
    };

    const handleScrape = async () => {
        if (!manager || !etf) return;

        const datesToScrape = Array.from(updateCandidates).sort();
        if (datesToScrape.length === 0) {
            // If no candidates, use current selected date from picker? 
            // Or enforce selection. Let's use targetDate if specific logic required, 
            // but user UX implies selecting dates.
            // Fallback to targetDate if candidates empty
            datesToScrape.push(toLocalDateString(targetDate));
        }

        setScraping(true);
        setScrapeProgress({ current: 0, total: datesToScrape.length });

        for (let i = 0; i < datesToScrape.length; i++) {
            const dateStr = datesToScrape[i];
            setScrapeProgress({ current: i + 1, total: datesToScrape.length });
            addLog(`Starting update for ${dateStr}...`, 'info');

            try {
                // Extract arguments for the new Rust command
                const commonArgs = (manager as any).common_args || [];
                const etfArgs = etf.args || [];

                // Helper to find value after a flag
                const findArg = (args: string[], flag: string) => {
                    const idx = args.indexOf(flag);
                    return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : "";
                };

                const provider = findArg(commonArgs, "--type") || manager.id;
                const id = findArg(etfArgs, "--id");
                const code = findArg(etfArgs, "--code") || etf.code;

                const output = await invoke<string>('get_etf_holdings', {
                    provider,
                    id,
                    code,
                    date: dateStr
                });

                addLog(`Update success for ${dateStr}: ${output}`, 'success');
                console.log(`[Sidecar Output for ${dateStr}]:`, output); // Log to console for debugging
            } catch (e) {
                addLog(`Update failed for ${dateStr}: ${e}`, 'error');
                console.error(`[Sidecar Error for ${dateStr}]:`, e);
            }

            // Artificial delay just in case
            await new Promise(r => setTimeout(r, 1000));
        }

        setScraping(false);
        setScrapeProgress(null);
        setUpdateCandidates(new Set()); // Clear selection
        loadHoldings(); // Refresh
    };

    const getEtfId = (args: string[]) => {
        const idIndex = args.indexOf('--id');
        if (idIndex !== -1 && idIndex + 1 < args.length) {
            return args[idIndex + 1];
        }
        return '';
    };

    const handleHeaderDoubleClick = async () => {
        if (!manager || !manager.view_url || !etf) return;

        const commonArgs = (manager as any).common_args || [];
        const fullArgs = [...commonArgs, ...etf.args];
        const idVal = getEtfId(fullArgs);

        if (!idVal) {
            addLog("Could not find ETF ID for URL", "error");
            return;
        }

        const url = manager.view_url.replace('{$}', idVal);
        try {
            await openUrl(url);
        } catch (e) {
            addLog(`Failed to open browser: ${e}`, 'error');
        }
    };

    const handleAnalyze = () => {
        if (!viewStartDate || !viewEndDate) {
            addLog("Please select both Start and End dates for analysis", "error");
            return;
        }

        const startStr = toLocalDateString(viewStartDate);
        const endStr = toLocalDateString(viewEndDate);

        const startHoldings = holdings.filter(h => h.date === startStr);
        const endHoldings = holdings.filter(h => h.date === endStr);

        if (startHoldings.length === 0 || endHoldings.length === 0) {
            addLog(`No data found for ${startStr} or ${endStr}`, "error");
            return;
        }

        const startMap = new Map(startHoldings.map(h => [h.name, h.weight]));
        const endMap = new Map(endHoldings.map(h => [h.name, h.weight]));

        // Pre-calculate date structure for event finding
        const rangeHoldings = holdings.filter(h => h.date >= startStr && h.date <= endStr);
        const sortedRangeDates = Array.from(new Set(rangeHoldings.map(h => h.date))).sort();
        const dateToStocks = new Map<string, Set<string>>();

        // Initialize sets for all dates (to ensure strict checking of existence)
        sortedRangeDates.forEach(d => dateToStocks.set(d, new Set()));

        rangeHoldings.forEach(h => {
            dateToStocks.get(h.date)?.add(h.name);
        });

        const inStocks: { name: string; display: string }[] = [];
        const outStocks: { name: string; display: string }[] = [];

        // Check for In
        endHoldings.forEach(h => {
            if (!startMap.has(h.name)) {
                // Find first date present
                const firstAppearDate = sortedRangeDates.find(d => dateToStocks.get(d)?.has(h.name));
                const dateDisplay = firstAppearDate ? firstAppearDate.slice(5) : '??-??'; // 2023-01-01 -> 01-01
                inStocks.push({ name: h.name, display: `${h.name} (${dateDisplay})` });
            }
        });

        // Check for Out
        startHoldings.forEach(h => {
            if (!endMap.has(h.name)) {
                // Find first date missing (after start)
                const firstMissingIndex = sortedRangeDates.findIndex(d => !dateToStocks.get(d)?.has(h.name));
                // If it's missing at index i, it was present at i-1.
                // Since it's in startHoldings (index 0), firstMissingIndex should be > 0.
                let lastPresentDate = '??-??';
                if (firstMissingIndex > 0) {
                    lastPresentDate = sortedRangeDates[firstMissingIndex - 1];
                } else if (firstMissingIndex === -1) {
                    // Should not happen if it's missing in endMap (unless endStr isn't in sortedRangeDates?)
                    // Fallback to startStr or similar
                    lastPresentDate = startStr;
                }

                const dateDisplay = lastPresentDate.slice(5);
                outStocks.push({ name: h.name, display: `${h.name} (${dateDisplay})` });
            }
        });

        // Add structured log
        const range = `${startStr} ~ ${endStr}`;
        setLogs(prev => [...prev, {
            time: new Date().toLocaleTimeString(),
            type: 'analysis',
            message: `Analysis Complete (${range})`,
            analysisData: { range, inList: inStocks, outList: outStocks }
        }]);
    };

    // Series Names & Toggle Logic Moved Up

    // Pre-compute whether split view is possible (maxGap > 5%p threshold)
    const canSplit = useMemo(() => {
        if (!holdings.length) return false;

        const dates = Array.from(new Set(holdings.map(h => h.date))).sort();
        const relevantDates = dates.filter(d => {
            const dDate = new Date(d);
            if (viewStartDate && dDate < viewStartDate) return false;
            if (viewEndDate && dDate > viewEndDate) return false;
            return true;
        });

        const visibleWeights: number[] = [];
        holdings.forEach(h => {
            if (relevantDates.includes(h.date) && seriesNames.includes(h.name) && !hiddenSeries.has(h.name)) {
                visibleWeights.push(h.weight);
            }
        });
        visibleWeights.sort((a, b) => b - a);

        let maxGap = 0;
        for (let i = 0; i < visibleWeights.length - 1; i++) {
            const gap = visibleWeights[i] - visibleWeights[i + 1];
            if (gap > maxGap) maxGap = gap;
        }

        return maxGap > 5;
    }, [holdings, viewStartDate, viewEndDate, seriesNames, hiddenSeries]);

    // Auto-disable expanded mode when split becomes impossible
    useEffect(() => {
        if (!canSplit && isExpanded) {
            setIsExpanded(false);
        }
    }, [canSplit]);

    // Calculate Chart Data
    const chartOption = useMemo(() => {
        if (!holdings.length) return {};

        const dates = Array.from(new Set(holdings.map(h => h.date))).sort();
        const relevantDates = dates.filter(d => {
            const dDate = new Date(d);
            if (viewStartDate && dDate < viewStartDate) return false;
            if (viewEndDate && dDate > viewEndDate) return false;
            return true;
        });

        const titleText = `Top ${topN === 'all' ? 'All' : topN} : ${relevantDates[0] || ''} ~ ${relevantDates[relevantDates.length - 1] || ''}`;

        let hasSplit = false;
        let topMin = 0;
        let bottomMax = 0;

        if (isExpanded) {
            const visibleWeights: number[] = [];
            holdings.forEach(h => {
                if (relevantDates.includes(h.date) && seriesNames.includes(h.name) && !hiddenSeries.has(h.name)) {
                    visibleWeights.push(h.weight);
                }
            });
            visibleWeights.sort((a, b) => b - a);

            let maxGap = 0;
            let splitIndex = -1;
            for (let i = 0; i < visibleWeights.length - 1; i++) {
                const gap = visibleWeights[i] - visibleWeights[i + 1];
                if (gap > maxGap) {
                    maxGap = gap;
                    splitIndex = i;
                }
            }

            if (maxGap > 5 && splitIndex !== -1) {
                hasSplit = true;
                topMin = Math.max(0, Math.floor(visibleWeights[splitIndex] - 2));
                bottomMax = Math.ceil(visibleWeights[splitIndex + 1] + 1);
            }
        }

        const standardGrid = { left: '3%', right: '4%', bottom: '20px', top: '15%', containLabel: true };
        const splitGrids = [
            { left: '3%', right: '4%', bottom: `${100 - splitRatio + 2}%`, top: '12%', containLabel: true },
            { left: '3%', right: '4%', bottom: '20px', top: `${splitRatio + 2}%`, containLabel: true }
        ];

        const standardXAxis = {
            type: 'category',
            boundaryGap: false,
            data: relevantDates,
            triggerEvent: true
        };
        const splitXAxes = [
            { ...standardXAxis, gridIndex: 0, axisLabel: { show: false }, axisTick: { show: false } },
            { ...standardXAxis, gridIndex: 1 }
        ];

        const standardYAxis = {
            type: 'value',
            min: (value: any) => Math.max(0, value.min - 5),
            minInterval: 1,
            axisLabel: { formatter: (value: number) => value.toFixed(0) }
        };
        const splitYAxes = [
            {
                type: 'value',
                gridIndex: 0,
                min: topMin,
                minInterval: 1,
                axisLabel: { formatter: (value: number) => value.toFixed(0) }
            },
            {
                type: 'value',
                gridIndex: 1,
                max: bottomMax,
                minInterval: 1,
                axisLabel: { formatter: (value: number) => value.toFixed(0) }
            }
        ];

        return {
            title: [
                {
                    text: titleText,
                    left: 'center',
                    textStyle: { color: '#ccc', fontSize: 14 }
                }
            ],
            tooltip: {
                trigger: 'item',
                axisPointer: { type: 'cross' },
                appendToBody: true,
                confine: true,
                extraCssText: 'border: 1px solid #444; background-color: rgba(0, 0, 0, 0.8);',
                formatter: (params: any) => {
                    const date = params.name;
                    if (!date) return '';

                    const hoveredName = params.seriesName;
                    const items = holdings.filter(h =>
                        h.date === date &&
                        seriesNames.includes(h.name) &&
                        !hiddenSeries.has(h.name)
                    );
                    items.sort((a, b) => b.weight - a.weight);

                    let html = `<div style="font-weight:bold; margin-bottom:5px;">${date}</div>`;
                    items.forEach((h: any) => {
                        const idx = seriesNames.indexOf(h.name);
                        const color = idx >= 0 ? COLOR_PALETTE[idx % COLOR_PALETTE.length] : '#ccc';
                        const marker = `<span style="display:inline-block;margin-right:5px;border-radius:10px;width:10px;height:10px;background-color:${color};"></span>`;

                        const isFocused = h.name === hoveredName;
                        const rowStyle = isFocused
                            ? 'font-weight:bold; color: #ff9999; background: rgba(255,255,255,0.15); border-radius: 4px;'
                            : '';
                        const padding = isFocused ? 'padding: 4px 6px; margin: 2px -6px;' : 'padding: 2px 0;';

                        html += `<div style="display:flex; align-items:center; justify-content:space-between; gap:10px; ${rowStyle} ${padding}">
                                    <div style="display:flex; align-items:center; gap:5px;">
                                        ${marker}
                                        <span>${h.name}</span>
                                    </div>
                                    <span style="font-weight:${isFocused ? '800' : '600'};">${h.weight.toFixed(2)}</span>
                                 </div>`;
                    });
                    return html;
                }
            },
            legend: { show: false },
            grid: hasSplit ? splitGrids : standardGrid,
            xAxis: hasSplit ? splitXAxes : standardXAxis,
            yAxis: hasSplit ? splitYAxes : standardYAxis,
            series: seriesNames.flatMap((stockName) => {
                const isHidden = hiddenSeries.has(stockName);
                const isHighlighted = highlightedSeries === stockName;
                const isDimmed = highlightedSeries !== null && !isHighlighted;

                const seriesData = isHidden ? [] : relevantDates.map(d => {
                    const h = holdings.find(item => item.date === d && item.name === stockName);
                    return h ? h.weight : null;
                });

                const baseSeries = {
                    name: stockName,
                    type: 'line',
                    smooth: true,
                    symbol: 'circle',
                    symbolSize: 8,
                    itemStyle: { opacity: 0 },
                    emphasis: {
                        focus: 'series',
                        blurScope: 'coordinateSystem',
                        itemStyle: { opacity: 1 },
                        scale: true
                    },
                    lineStyle: {
                        width: isHighlighted ? 3 : 1,
                        opacity: isDimmed ? 0.1 : 1,
                        color: isDimmed ? '#555' : undefined
                    },
                    z: isHighlighted ? 10 : 2,
                    data: seriesData,
                    animation: !initialAnimationComplete || isHighlighted,
                    animationDuration: 500
                };

                if (hasSplit) {
                    return [
                        { ...baseSeries, id: `${stockName}-top${isHighlighted ? '-highlighted' : ''}`, xAxisIndex: 0, yAxisIndex: 0 },
                        { ...baseSeries, id: `${stockName}-bottom${isHighlighted ? '-highlighted' : ''}`, xAxisIndex: 1, yAxisIndex: 1 }
                    ];
                }

                return {
                    ...baseSeries,
                    id: isHighlighted ? `${stockName}-highlighted` : stockName
                };
            }),
            color: COLOR_PALETTE
        };
    }, [holdings, topN, viewStartDate, viewEndDate, seriesNames, hiddenSeries, highlightedSeries, initialAnimationComplete, isExpanded, splitRatio]);

    // Right Sidebar Logic
    useEffect(() => {
        if (setRightPanelContent) {
            // Pass HoldingsTable
            const tableHoldings = holdings.filter(h => h.date === (selectedTableDate || toLocalDateString(targetDate)));
            tableHoldings.sort((a, b) => b.weight - a.weight);

            const compHoldings = comparisonDate
                ? holdings.filter(h => h.date === comparisonDate)
                : undefined;

            const availableDates = new Set(holdings.map(h => h.date));

            setRightPanelContent(
                <HoldingsTable
                    date={selectedTableDate || toLocalDateString(targetDate)}
                    holdings={tableHoldings}
                    onStockClick={(name) => {
                        // Isolate trigger from table
                        // Check if stock exists in chart series
                        if (seriesNames.includes(name)) {
                            isolateSeries(name);
                        } else {
                            console.log('Stock not in chart series:', name);
                        }
                    }}
                    comparisonHoldings={compHoldings}
                    onCompare={setComparisonDate}
                    availableDates={availableDates}
                    compareDate={comparisonDate}
                />
            );
        }
    }, [holdings, selectedTableDate, comparisonDate, targetDate, setRightPanelContent]);


    // Empty State
    if (!etfCode) {
        return (
            <div style={{
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#64748b',
                flexDirection: 'column',
                gap: '20px'
            }}>
                <div style={{ fontSize: '3rem', opacity: 0.2 }}>📊</div>
                <div style={{ fontSize: '1.2rem' }}>좌측 목록에서 ETF를 선택해주세요</div>
            </div>
        );
    }

    return (
        <div style={{ padding: '5px 20px 20px 20px', height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <h2
                            onDoubleClick={handleHeaderDoubleClick}
                            style={{
                                margin: 0,
                                fontSize: '1.5rem',
                                cursor: 'pointer',
                                whiteSpace: 'normal',
                                wordBreak: 'break-word',
                                lineHeight: 1.2,
                                marginTop: '10px'
                            }}
                            title="Double click to open on web"
                        >
                            {etf?.name || etfCode}
                        </h2>
                        {etfCode && onToggleFavorite && (
                            <button
                                onClick={() => onToggleFavorite(etfCode)}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: favorites?.has(etfCode) ? '#fbbf24' : 'rgba(255,255,255,0.3)',
                                    fontSize: '1.5rem',
                                    cursor: 'pointer',
                                    padding: '0 5px',
                                    transition: 'transform 0.2s, color 0.2s'
                                }}
                                title={favorites?.has(etfCode) ? "즐겨찾기 해제" : "즐겨찾기 추가"}
                            >
                                {favorites?.has(etfCode) ? '★' : '☆'}
                            </button>
                        )}
                    </div>
                    <span style={{ color: 'var(--secondary-color)', fontSize: '0.9rem' }}>{etfCode} • {manager?.name}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '30px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontWeight: 600, color: '#cbd5e1' }}>View:</span>
                        <select
                            value={topN}
                            onChange={(e) => setTopN(e.target.value)}
                            style={{
                                background: 'rgba(255,255,255,0.1)',
                                border: '1px solid rgba(255,255,255,0.2)',
                                color: 'white',
                                padding: '8px',
                                borderRadius: '8px',
                                outline: 'none'
                            }}
                        >
                            <option value="10" style={{ background: '#1e293b' }}>Top 10</option>
                            <option value="20" style={{ background: '#1e293b' }}>Top 20</option>
                            <option value="all" style={{ background: '#1e293b' }}>All</option>
                        </select>

                        <label
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '5px',
                                color: canSplit ? '#cbd5e1' : '#475569',
                                cursor: canSplit ? 'pointer' : 'not-allowed',
                                fontSize: '0.9rem',
                                opacity: canSplit ? 1 : 0.5,
                                transition: 'opacity 0.2s'
                            }}
                            title={canSplit ? '종목 간 비중 차이가 큰 구간을 분리하여 표시합니다' : '확대 불가: 종목 간 비중 차이가 5%p를 초과하는 구간이 없습니다'}
                        >
                            <input
                                type="checkbox"
                                checked={isExpanded}
                                disabled={!canSplit}
                                onChange={(e) => setIsExpanded(e.target.checked)}
                            />
                            확대
                        </label>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'rgba(255,255,255,0.05)', padding: '2px 5px', borderRadius: '4px' }}>
                            <DatePicker
                                selected={viewStartDate}
                                onChange={(date: Date | null) => setViewStartDate(date)}
                                dateFormat="yyyy-MM-dd"
                                placeholderText="Start"
                                customInput={<input style={{ width: '85px', background: 'transparent', border: 'none', color: 'white', textAlign: 'center', fontSize: '0.8rem' }} />}
                            />
                            <span style={{ color: '#64748b' }}>~</span>
                            <DatePicker
                                selected={viewEndDate}
                                onChange={(date: Date | null) => setViewEndDate(date)}
                                dateFormat="yyyy-MM-dd"
                                placeholderText="End"
                                customInput={<input style={{ width: '85px', background: 'transparent', border: 'none', color: 'white', textAlign: 'center', fontSize: '0.8rem' }} />}
                            />
                        </div>

                        <button
                            style={{
                                background: 'transparent',
                                border: '1px solid var(--primary-color)',
                                color: 'var(--primary-color)',
                                padding: '6px 12px',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '0.85rem'
                            }}
                            onClick={handleAnalyze}
                        >
                            Analyze
                        </button>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontWeight: 600, color: '#cbd5e1' }}>Update:</span>
                        <DatePicker
                            selected={targetDate}
                            onChange={(date: Date | null) => {
                                if (date) {
                                    setTargetDate(date);
                                    toggleCandidate(date);
                                }
                            }}
                            shouldCloseOnSelect={false}
                            dateFormat="yyyy-MM-dd"
                            dayClassName={(date: Date) => {
                                const dStr = toLocalDateString(date);
                                if (updateCandidates.has(dStr)) return 'candidate-date';
                                if (availableDataDates.has(dStr)) return 'has-data-date';
                                return "";
                            }}
                            customInput={
                                <button style={{
                                    background: 'rgba(255,255,255,0.1)',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    color: 'white',
                                    padding: '8px 12px',
                                    borderRadius: '8px',
                                    cursor: 'pointer'
                                }}>
                                    {toLocalDateString(targetDate)}
                                </button>
                            }
                        />
                    </div>

                    <button
                        onClick={handleScrape}
                        disabled={scraping || updateCandidates.size === 0}
                        style={{
                            background: (scraping || updateCandidates.size === 0) ? '#475569' : 'var(--primary-color)', // Grey if disabled
                            color: 'white',
                            border: 'none',
                            padding: '8px 16px',
                            borderRadius: '8px',
                            fontWeight: 600,
                            cursor: scraping || updateCandidates.size === 0 ? 'not-allowed' : 'pointer',
                            opacity: scraping || updateCandidates.size === 0 ? 0.7 : 1,
                            transition: 'all 0.2s',
                            boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                        }}
                    >
                        {scraping
                            ? `Running (${scrapeProgress?.current}/${scrapeProgress?.total})`
                            : updateCandidates.size > 0 ? `Update (${updateCandidates.size})` : 'Update'
                        }
                    </button>
                </div>
            </header>

            {/* Chart Area */}
            <div
                id="chart-container"
                style={{
                    flex: 1,
                    minHeight: '550px', // Reverted to 550px per request
                    height: '100%',
                    overflow: 'hidden',
                    background: 'rgba(30, 41, 59, 0.4)',
                    borderRadius: '16px',
                    padding: '10px',
                    border: '1px solid rgba(255,255,255,0.05)',
                    display: 'flex',
                    flexDirection: 'column', // Prepare for legend below chart in this box if needed? No, separate.
                    transition: 'all 0.3s ease',
                    position: 'relative'
                }}>
                {loading ? (
                    <div className="spinner" style={{ margin: 'auto' }}></div>
                ) : (
                    <>
                        <ReactECharts
                            ref={chartRef}
                            option={chartOption}
                            style={{ height: '100%', width: '100%', flex: 1, pointerEvents: isDraggingSplit ? 'none' : 'auto' }}
                            theme="dark"
                            notMerge={true} // Critical: prevents ghost lines when series IDs change
                            onEvents={{
                                click: (params: any) => {
                                    // Handle click on axis label explicitly (since ZRender might miss DOM elements outside grid)
                                    if (params.componentType === 'xAxis') {
                                        const clickedDate = params.value;
                                        if (clickedDate && /^\d{4}-\d{2}-\d{2}$/.test(clickedDate)) {
                                            setTargetDate(new Date(clickedDate));
                                            setSelectedTableDate(clickedDate);
                                        }
                                    }
                                }
                            }}
                        />
                        {/* Draggable Divider for Split Mode */}
                        {isExpanded && chartOption?.grid && Array.isArray(chartOption.grid) && (
                            <div
                                style={{
                                    position: 'absolute',
                                    top: `${splitRatio}%`,
                                    left: '3%',
                                    right: '4%',
                                    height: '10px',
                                    marginTop: '-5px', // Center it on the split line
                                    cursor: 'row-resize',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    zIndex: 10
                                }}
                                onMouseDown={() => setIsDraggingSplit(true)}
                            >
                                {/* Invisible hit area is 10px tall, visible line is thinner */}
                                <div style={{
                                    width: '100%',
                                    height: isDraggingSplit ? '2px' : '1px',
                                    background: isDraggingSplit ? '#3b82f6' : 'rgba(100, 116, 139, 0.5)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'background 0.2s'
                                }}>
                                    <span style={{
                                        background: '#1e293b',
                                        color: isDraggingSplit ? '#3b82f6' : '#64748b',
                                        padding: '0 10px',
                                        fontSize: '18px',
                                        fontWeight: 'bold',
                                        lineHeight: '10px'
                                    }}>
                                        ···
                                    </span>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Custom Legend Area */}
            {
                seriesNames.length > 0 && !loading && (
                    <div style={{
                        padding: '8px 4px',
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '6px',
                        justifyContent: 'center',
                        maxHeight: '80px', // Approx 3 lines
                        overflowY: 'auto',
                        marginTop: '5px',
                        scrollbarWidth: 'thin',
                        scrollbarColor: 'rgba(255,255,255,0.2) transparent'
                    }}>
                        {seriesNames.map((name, idx) => (
                            <div
                                key={name}
                                onClick={() => toggleSeries(name)}
                                onDoubleClick={() => isolateSeries(name)}
                                title="Click to toggle, Double-click to isolate"
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    fontSize: '0.8rem',
                                    color: hiddenSeries.has(name) ? '#64748b' : (highlightedSeries && highlightedSeries !== name ? '#64748b' : '#e2e8f0'),
                                    cursor: 'pointer',
                                    background: highlightedSeries === name ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255,255,255,0.05)',
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                    userSelect: 'none',
                                    textDecoration: hiddenSeries.has(name) ? 'line-through' : 'none',
                                    border: highlightedSeries === name ? '1px solid #3b82f6' : '1px solid transparent',
                                    opacity: (highlightedSeries && highlightedSeries !== name) ? 0.5 : 1
                                }}
                            >
                                <span style={{
                                    width: '10px',
                                    height: '2px', // Thin line for Line series legend mark
                                    background: hiddenSeries.has(name) ? '#64748b' : (COLOR_PALETTE[idx % COLOR_PALETTE.length]),
                                    display: 'inline-block'
                                }}></span>
                                {name}
                            </div>
                        ))}
                    </div>
                )
            }

            {/* Logs Area Toggle */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '5px 0' }}>
                <button
                    onClick={() => setLogs([])}
                    style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.8rem', marginRight: '10px' }}
                >
                    Clear Logs
                </button>
                <button
                    onClick={() => setIsLogsOpen(!isLogsOpen)}
                    style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.8rem' }}
                >
                    {isLogsOpen ? 'Hide Logs ▼' : 'Show Logs ▲'}
                </button>
            </div>

            {/* Logs Area */}
            <div style={{
                height: isLogsOpen ? '200px' : '0px',
                overflow: 'hidden',
                transition: 'height 0.3s ease',
                background: '#0f172a',
                borderRadius: '12px',
                border: isLogsOpen ? '1px solid #334155' : 'none'
            }}>
                <div style={{ padding: '10px 15px 0px 15px', height: '100%', overflowY: 'auto', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                    {logs.length === 0 && <div style={{ color: '#475569', textAlign: 'center', marginTop: '20px' }}>Metrics and logs will appear here...</div>}
                    {logs.map((log, idx) => {
                        if (log.type === 'analysis' && log.analysisData) {
                            return (
                                <div key={idx} style={{
                                    marginBottom: '10px',
                                    padding: '10px',
                                    background: 'rgba(30, 41, 59, 0.6)',
                                    borderRadius: '8px',
                                    borderLeft: '4px solid #8b5cf6', // Violet accent
                                    borderTop: '1px solid rgba(255,255,255,0.05)',
                                    borderRight: '1px solid rgba(255,255,255,0.05)',
                                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600 }}>
                                        <span style={{ color: '#e2e8f0' }}>{log.message}</span>
                                        <span style={{ color: '#64748b', fontSize: '0.8rem' }}>{log.time}</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '20px', fontSize: '0.85rem' }}>
                                        {/* IN Section */}
                                        <div style={{ flex: 1 }}>
                                            <span style={{ color: '#10b981', fontWeight: 'bold', marginRight: '5px' }}>In:</span>
                                            {log.analysisData.inList.length === 0 ? <span style={{ color: '#64748b' }}>-</span> : (
                                                <div style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '8px' }}>
                                                    {log.analysisData.inList.map((item, i) => (
                                                        <span
                                                            key={i}
                                                            onClick={() => isolateSeries(item.name)}
                                                            style={{
                                                                color: '#cbd5e1',
                                                                cursor: 'pointer',
                                                                textDecoration: 'underline',
                                                                textDecorationColor: 'rgba(255,255,255,0.2)'
                                                            }}
                                                            onMouseEnter={(e) => e.currentTarget.style.color = '#fff'}
                                                            onMouseLeave={(e) => e.currentTarget.style.color = '#cbd5e1'}
                                                        >
                                                            {item.display}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        {/* OUT Section */}
                                        <div style={{ flex: 1 }}>
                                            <span style={{ color: '#ef4444', fontWeight: 'bold', marginRight: '5px' }}>Out:</span>
                                            {log.analysisData.outList.length === 0 ? <span style={{ color: '#64748b' }}>-</span> : (
                                                <div style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '8px' }}>
                                                    {log.analysisData.outList.map((item, i) => (
                                                        <span
                                                            key={i}
                                                            onClick={() => isolateSeries(item.name)}
                                                            style={{
                                                                color: '#cbd5e1',
                                                                cursor: 'pointer',
                                                                textDecoration: 'underline',
                                                                textDecorationColor: 'rgba(255,255,255,0.2)'
                                                            }}
                                                            onMouseEnter={(e) => e.currentTarget.style.color = '#fff'}
                                                            onMouseLeave={(e) => e.currentTarget.style.color = '#cbd5e1'}
                                                        >
                                                            {item.display}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        }
                        return (
                            <div key={idx} style={{ marginBottom: '8px', display: 'flex', lineHeight: '1.4', alignItems: 'flex-start' }}>
                                <span style={{ color: '#64748b', marginRight: '10px', minWidth: '80px', flexShrink: 0 }}>[{log.time}]</span>
                                <span style={{
                                    color: log.type === 'error' ? '#ef4444' :
                                        log.type === 'success' ? '#10b981' :
                                            log.type === 'analysis' ? '#f59e0b' : '#e2e8f0',
                                    wordBreak: 'break-all'
                                }}>
                                    {log.message}
                                </span>
                            </div>
                        );
                    })}
                    <div style={{ height: '20px', minHeight: '20px', flexShrink: 0 }} />
                    <div ref={logsEndRef} />
                </div>
            </div>

            <style>{`
                .candidate-date {
                    background-color: #ef4444 !important;
                    color: white !important;
                }

                .has-data-date {
                    color: #3b82f6 !important;
                    font-weight: bold;
                }
                .spinner {
                    width: 40px;
                    height: 40px;
                    border: 4px solid #f3f3f3;
                    border-top: 4px solid #3b82f6;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `}</style>
        </div >
    );
};

export default Dashboard;
