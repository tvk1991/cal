/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback, Component, ErrorInfo, ReactNode } from 'react';

// Error Boundary Component
class ErrorBoundary extends Component<{children: ReactNode}, {hasError: boolean, error: Error | null}> {
    constructor(props: {children: ReactNode}) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error) {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: '20px', textAlign: 'center', background: '#fff', height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                    <h2 style={{ color: '#c0392b' }}>Đã xảy ra lỗi!</h2>
                    <p>Ứng dụng không thể khởi động. Vui lòng thử tải lại trang.</p>
                    <pre style={{ background: '#f1f2f6', padding: '10px', borderRadius: '8px', fontSize: '12px', maxWidth: '100%', overflow: 'auto' }}>
                        {this.state.error?.message}
                    </pre>
                    <button onClick={() => window.location.reload()} style={{ marginTop: '20px', padding: '10px 20px', background: '#27ae60', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
                        Tải lại trang
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

export default function App() {
    return (
        <ErrorBoundary>
            <CalculatorApp />
        </ErrorBoundary>
    );
}

function CalculatorApp() {
    // --- State gốc ---
    const [historyExpr, setHistoryExpr] = useState("");
    const [targetInput, setTargetInput] = useState("");
    const [isTargetMode, setIsTargetMode] = useState(false);
    const [calculationHistory, setCalculationHistory] = useState<any[]>([]);
    const [cursorPos, setCursorPos] = useState<number | null>(null);
    const [isResultDisplayed, setIsResultDisplayed] = useState(false);
    const [theme, setTheme] = useState("light");
    const [showHistory, setShowHistory] = useState(false);
    const [resultPreview, setResultPreview] = useState("0");
    const [comparisonMsg, setComparisonMsg] = useState({ text: "", color: "" });
    const [isNeonDanger, setIsNeonDanger] = useState(false);
    const [isShake, setIsShake] = useState(false);

    // --- Refs ---
    const audioCtxRef = useRef<AudioContext | null>(null);
    const exprDivRef = useRef<HTMLDivElement>(null);
    const backTimerRef = useRef<any>(null);
    const backIntervalRef = useRef<any>(null);

    // --- Khởi tạo ---
    useEffect(() => {
        const saved = localStorage.getItem('calc_history');
        if (saved) setCalculationHistory(JSON.parse(saved));
        
        // Audio Context init
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }, []);

    useEffect(() => {
        localStorage.setItem('calc_history', JSON.stringify(calculationHistory));
    }, [calculationHistory]);

    useEffect(() => {
        document.body.setAttribute('data-theme', theme);
    }, [theme]);

    // --- Logic gốc ---
    const playSound = (type: string) => {
        const ctx = audioCtxRef.current;
        if (!ctx) return;
        if (ctx.state === 'suspended') ctx.resume();
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        if (type === 'click') {
            osc.type = 'sine'; osc.frequency.setValueAtTime(800, ctx.currentTime);
            gain.gain.setValueAtTime(0.05, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
            osc.start(); osc.stop(ctx.currentTime + 0.1);
        } else if (type === 'success') {
            osc.type = 'triangle'; osc.frequency.setValueAtTime(523.25, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(1046.5, ctx.currentTime + 0.3);
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
            osc.start(); osc.stop(ctx.currentTime + 0.4);
        } else if (type === 'fail') {
            osc.type = 'sawtooth'; osc.frequency.setValueAtTime(150, ctx.currentTime);
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
            osc.start(); osc.stop(ctx.currentTime + 0.5);
        }
    };

    const vibrate = () => { if (navigator.vibrate) navigator.vibrate(15); };

    const formatNumber = (val: any) => {
        if (!val && val !== 0) return "";
        let s = val.toString().split('.');
        s[0] = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
        return s.length > 1 ? s[0] + "," + s[1] : s[0];
    };

    const autoPreview = useCallback((currentExpr: string) => {
        try {
            let temp = currentExpr; if (!temp) { setResultPreview("0"); return; }
            while (['+','-','*','/','(','.'].includes(temp.slice(-1))) temp = temp.slice(0, -1);
            let open = (temp.match(/\(/g) ||[]).length, close = (temp.match(/\)/g) ||[]).length;
            if (open > close) temp += ")".repeat(open - close);
            let pVal = Math.round(eval(temp) * 1000000) / 1000000;
            setResultPreview(formatNumber(pVal));
            
            if (targetInput !== "" && pVal > parseFloat(targetInput)) {
                setIsNeonDanger(true); 
                setComparisonMsg({ text: "⚠️ VƯỢT QUÁ!", color: "var(--danger)" });
            } else { 
                setIsNeonDanger(false); 
                if (!isTargetMode) setComparisonMsg({ text: "", color: "" }); 
            }
        } catch(e) { setResultPreview("0"); }
    }, [targetInput, isTargetMode]);

    const handleInput = (n: string) => {
        playSound('click');
        let newExpr = historyExpr;
        let newTarget = targetInput;

        if (isResultDisplayed && !isTargetMode) {
            newExpr = ""; setIsResultDisplayed(false); setCursorPos(null);
        }

        if (isTargetMode) {
            if (n === '.' && targetInput.includes('.')) return;
            newTarget += n;
            setTargetInput(newTarget);
        } else {
            if (cursorPos !== null) {
                newExpr = newExpr.slice(0, cursorPos) + n + newExpr.slice(cursorPos);
                setCursorPos(cursorPos + n.length);
            } else {
                if (targetInput !== "" && !isNaN(Number(n))) {
                    let cleanedExpr = newExpr + n;
                    while (['+','-','*','/','(','.'].includes(cleanedExpr.slice(-1))) cleanedExpr = cleanedExpr.slice(0, -1);
                    try {
                        let open = (cleanedExpr.match(/\(/g) ||[]).length, close = (cleanedExpr.match(/\)/g) ||[]).length;
                        if (open > close) cleanedExpr += ")".repeat(open - close);
                        let potential = Math.round(eval(cleanedExpr) * 1000000) / 1000000;
                        if (potential > parseFloat(targetInput)) {
                            setComparisonMsg({ text: "⚠️ SẼ VƯỢT MỤC TIÊU!", color: "var(--danger)" });
                            setIsShake(true); setTimeout(() => setIsShake(false), 400);
                            setIsNeonDanger(true); playSound('fail');
                        }
                    } catch(e) {}
                }
                newExpr += n;
            }
            setHistoryExpr(newExpr);
            autoPreview(newExpr);
        }
    };

    const addOp = (op: string) => {
        playSound('click'); setIsResultDisplayed(false);
        if (isTargetMode) setIsTargetMode(false);

        let newExpr = historyExpr;
        if (cursorPos !== null) {
            const charBefore = cursorPos > 0 ? newExpr[cursorPos - 1] : '';
            if (['+','-','*','/'].includes(charBefore)) {
                newExpr = newExpr.slice(0, cursorPos - 1) + op + newExpr.slice(cursorPos);
            } else {
                newExpr = newExpr.slice(0, cursorPos) + op + newExpr.slice(cursorPos);
                setCursorPos(cursorPos + 1);
            }
        } else {
            const last = newExpr.slice(-1);
            if (['+','-','*','/'].includes(last)) newExpr = newExpr.slice(0, -1) + op;
            else if (newExpr !== "" || op === '-') newExpr += op;
        }
        setHistoryExpr(newExpr);
        autoPreview(newExpr);
    };

    const applyPercent = () => {
        if (isTargetMode) return;
        playSound('click'); setCursorPos(null);
        try {
            let parts = historyExpr.split(/([\+\-\*\/])/), lastPart = parts.pop() || "", op = parts.pop() || "";
            let base = eval(parts.join("") || "0");
            let val = (op === '+' || op === '-') ? base * (parseFloat(lastPart) / 100) : parseFloat(lastPart) / 100;
            const newExpr = parts.join("") + op + val;
            setHistoryExpr(newExpr);
            autoPreview(newExpr);
        } catch(e) {}
    };

    const backspace = useCallback(() => {
        if (isTargetMode) {
            setTargetInput(prev => prev.slice(0, -1));
        } else {
            let newExpr = "";
            setHistoryExpr(prev => {
                if (cursorPos !== null) {
                    if (cursorPos > 0) {
                        newExpr = prev.slice(0, cursorPos - 1) + prev.slice(cursorPos);
                        setCursorPos(cursorPos - 1);
                    } else {
                        newExpr = prev;
                    }
                } else {
                    newExpr = prev.slice(0, -1);
                }
                autoPreview(newExpr);
                return newExpr;
            });
        }
    }, [isTargetMode, cursorPos, autoPreview]);

    const calculate = () => {
        if (isTargetMode) { setIsTargetMode(false); return; }
        let raw = historyExpr; if (!raw) return;
        setCursorPos(null);
        try {
            while (['+','-','*','/','(','.'].includes(raw.slice(-1))) raw = raw.slice(0, -1);
            let res = eval(raw); 
            let finalRes = Math.round(res * 1000000) / 1000000;

            if (targetInput !== "") {
                if (Math.abs(finalRes - parseFloat(targetInput)) < 0.00001) {
                    setComparisonMsg({ text: "✅ KHỚP TUYỆT ĐỐI", color: "var(--accent)" }); playSound('success');
                } else {
                    let diff = Math.round((finalRes - parseFloat(targetInput)) * 100) / 100;
                    setComparisonMsg({ 
                        text: (diff > 0 ? "❌ VƯỢT: " : "❌ THIẾU: ") + formatNumber(Math.abs(diff)),
                        color: "var(--danger)"
                    }); 
                    playSound('fail');
                }
            }
            
            const newHistoryItem = { expr: renderDisplayText(raw) + " =", res: finalRes, raw: raw };
            setCalculationHistory(prev => {
                const updated = [...prev, newHistoryItem];
                return updated.slice(-50);
            });

            setResultPreview(formatNumber(finalRes)); 
            setHistoryExpr(finalRes.toString());
            setIsResultDisplayed(true);
        } catch(e) { setResultPreview("Lỗi"); }
    };

    const clearAll = () => {
        playSound('click');
        if (isTargetMode) setTargetInput("");
        else { 
            setHistoryExpr(""); setTargetInput(""); setComparisonMsg({ text: "", color: "" }); 
            setCursorPos(null); setIsResultDisplayed(false); 
        }
        setResultPreview("0"); setIsNeonDanger(false);
    };

    const smartParenthesis = () => {
        playSound('click');
        let open = (historyExpr.match(/\(/g) ||[]).length, close = (historyExpr.match(/\)/g) ||[]).length;
        let char = (open > close && !['+','-','*','/','('].includes(historyExpr.slice(-1))) ? ")" : "(";
        let newExpr = historyExpr;
        if (cursorPos !== null) {
            newExpr = newExpr.slice(0, cursorPos) + char + newExpr.slice(cursorPos); 
            setCursorPos(cursorPos + 1);
        } else { 
            newExpr += char; 
        }
        setHistoryExpr(newExpr);
        autoPreview(newExpr);
    };

    const renderDisplayText = (text: string) => {
        let displayStr = text.replace(/\*/g,' × ').replace(/\//g,' ÷ ').replace(/\+/g,' + ').replace(/\-/g,' − ');
        return displayStr.replace(/(\d+(\.\d+)?)/g, match => formatNumber(match));
    };

    const renderDisplay = () => {
        if (isTargetMode) return null;
        if (cursorPos !== null) {
            const pre = renderDisplayText(historyExpr.slice(0, cursorPos));
            const post = renderDisplayText(historyExpr.slice(cursorPos));
            return (
                <>{pre}<span className="expr-cursor"></span>{post}</>
            );
        } else {
            return renderDisplayText(historyExpr);
        }
    };

    // --- Touch/Pointer Events ---
    const handleTouchStart = (e: React.TouchEvent) => {
        if (historyExpr === "" || isTargetMode) return;
        const touch = e.touches[0];
        vibrate();
        
        // Logic tối ưu vị trí con trỏ
        setTimeout(() => {
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                const textNode = range.startContainer;
                const offset = range.startOffset;

                if (textNode && exprDivRef.current) {
                    let totalOffset = 0; let found = false;
                    const nodes = Array.from(exprDivRef.current.childNodes);
                    for (let node of nodes) {
                        const n = node as Node;
                        if (n === textNode) { totalOffset += offset; found = true; break; }
                        if (n.nodeType === 3) {
                            totalOffset += (n.textContent || "").length;
                        } else if (n.nodeType === 1 && (n as HTMLElement).className !== 'expr-cursor') {
                            totalOffset += (n as HTMLElement).innerText.length;
                        }
                    }

                    if (found) {
                        let visualText = exprDivRef.current.innerText;
                        let visualPrefix = visualText.substring(0, totalOffset);
                        let rawPrefixLength = 0;
                        for(let i = 0; i < visualPrefix.length; i++) {
                            let char = visualPrefix[i];
                            if (char.match(/[0-9\(\)]/) ||['×','÷','+','−', ','].includes(char)) {
                                rawPrefixLength++;
                            }
                        }
                        setCursorPos(Math.min(rawPrefixLength, historyExpr.length));
                    }
                }
            }
        }, 10);
    };

    const handleBackPointerDown = (e: React.PointerEvent) => {
        e.preventDefault(); vibrate(); playSound('click'); backspace();
        backTimerRef.current = setTimeout(() => { 
            backIntervalRef.current = setInterval(() => { vibrate(); backspace(); }, 70); 
        }, 500);
    };

    const stopBack = () => { 
        clearTimeout(backTimerRef.current); 
        clearInterval(backIntervalRef.current); 
    };

    return (
        <div className="clevcalc-container">
            {/* History Box */}
            {showHistory && (
                <div id="historyBox" className="history-box" style={{ display: 'flex' }}>
                    <div style={{ display: 'flex', justifyBetween: 'space-between', alignItems: 'center', marginBottom: '20px', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--accent)' }}>Lịch sử</span>
                        <div id="closeHistory" className="control-btn" onClick={() => setShowHistory(false)}>
                            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ color: 'var(--key-text)' }} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </div>
                    </div>
                    <div id="historyList" className="history-list">
                        {calculationHistory.slice().reverse().map((item, i) => (
                            <div key={i} className="history-item" onClick={() => {
                                setHistoryExpr(item.raw);
                                setCursorPos(item.raw.length);
                                setIsResultDisplayed(false);
                                setShowHistory(false);
                                playSound('click');
                                autoPreview(item.raw);
                            }}>
                                <div className="history-expr">{item.expr}</div>
                                <div className="history-res">{formatNumber(item.res)}</div>
                            </div>
                        ))}
                    </div>
                    <button id="clearHistoryBtn" onClick={() => setCalculationHistory([])} style={{ marginTop: '15px', minHeight: '55px', background: 'var(--keypad-bg)', fontSize: '1rem', borderRadius: '12px', color: 'var(--danger)', width: '100%' }}>Xóa tất cả lịch sử</button>
                </div>
            )}

            <div className="display-screen">
                <div id="expression" ref={exprDivRef} onTouchStart={handleTouchStart}>
                    {renderDisplay()}
                </div>
                <div id="result-preview" className={isNeonDanger ? "neon-danger" : ""}>{resultPreview}</div>
                <div id="comparison-msg" className={isShake ? "shake" : ""} style={{ color: comparisonMsg.color }}>{comparisonMsg.text}</div>
                
                <div className={`target-area ${isTargetMode ? 'active-target' : ''}`} id="target-area-container">
                    <div className="control-btn" id="openHistory" onClick={() => { setShowHistory(true); vibrate(); }}>
                        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                    </div>
                    <div className="divider"></div>
                    <div className="control-btn" id="theme-toggle" onClick={() => { setTheme(theme === 'light' ? 'dark' : 'light'); vibrate(); playSound('click'); }}>
                        <svg id="theme-icon" viewBox="0 0 24 24">
                            {theme === 'light' ? (
                                <path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-11.314l.707.707m11.314 11.314l.707.707M12 8a4 4 0 100 8 4 4 0 000-8z"/>
                            ) : (
                                <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
                            )}
                        </svg>
                    </div>
                    <div className="divider"></div>
                    <div id="target-box" style={{ display: 'flex', alignItems: 'center', flex: 1, height: '100%', cursor: 'pointer' }} onClick={() => { setIsTargetMode(!isTargetMode); vibrate(); }}>
                        <span className="target-label">MỤC TIÊU:</span>
                        <div id="target-display">{formatNumber(targetInput) || "0"}</div>
                    </div>
                    <div className="control-btn btn-back-ctrl" id="btn-backspace" onPointerDown={handleBackPointerDown} onPointerUp={stopBack} onPointerLeave={stopBack}>
                        <svg viewBox="0 0 24 24"><path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"></path><line x1="18" y1="9" x2="12" y2="15"></line><line x1="12" y1="9" x2="18" y2="15"></line></svg>
                    </div>
                </div>
            </div>

            <div className="keypad">
                <button className="btn-clear" onClick={() => clearAll()}>C</button>
                <button className="btn-func" onClick={() => smartParenthesis()}>()</button>
                <button className="btn-func" onClick={() => applyPercent()}>%</button>
                <button className="btn-op" onClick={() => addOp('*')}>×</button>
                <button onClick={() => handleInput("7")}>7</button>
                <button onClick={() => handleInput("8")}>8</button>
                <button onClick={() => handleInput("9")}>9</button>
                <button className="btn-op" onClick={() => addOp('-')}>−</button>
                <button onClick={() => handleInput("4")}>4</button>
                <button onClick={() => handleInput("5")}>5</button>
                <button onClick={() => handleInput("6")}>6</button>
                <button className="btn-op btn-plus" onClick={() => addOp('+')}>+</button>
                <button onClick={() => handleInput("1")}>1</button>
                <button onClick={() => handleInput("2")}>2</button>
                <button onClick={() => handleInput("3")}>3</button>
                <button onClick={() => handleInput("0")}>0</button>
                <button onClick={() => handleInput("00")}>00</button>
                <button onClick={() => handleInput(".")}>,</button>
                <button className="btn-equal" onClick={() => calculate()}>=</button>
            </div>
        </div>
    );
}
