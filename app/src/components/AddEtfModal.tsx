import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface AddEtfResult {
    status: 'added' | 'exists' | 'error';
    etfName: string | null;
    message: string;
}

interface AddEtfModalProps {
    isOpen: boolean;
    onClose: () => void;
    onEtfAdded: () => void;
}

const SUPPORTED_MANAGERS = [
    {
        name: 'Timefolio (타임폴리오)',
        status: '지원',
        urlExample: 'https://timeetf.co.kr/m11_view.php?idx=22',
        note: 'idx 파라미터가 포함된 ETF 상품 페이지 URL을 입력하세요.',
    },
    {
        name: 'KoAct (삼성액티브자산운용)',
        status: '지원',
        urlExample: 'https://www.samsungactive.co.kr/etf/view.do?id=2ETFM8',
        note: 'id 파라미터가 포함된 ETF 상품 페이지 URL을 입력하세요.',
    },
    {
        name: 'KODEX (삼성자산운용)',
        status: '지원',
        urlExample: 'https://www.samsungfund.com/etf/product/view.do?id=2ETFH5',
        note: 'id 파라미터가 포함된 ETF 상품 페이지 URL을 입력하세요. (최근 출시 ETF만 지원)',
    },
    {
        name: 'RISE (KB자산운용)',
        status: '지원',
        urlExample: 'https://www.riseetf.co.kr/prod/finderDetail/44K0',
        note: 'URL 마지막 경로가 ETF ID입니다.',
    },
    {
        name: 'PLUS (한화자산운용)',
        status: '지원',
        urlExample: 'https://www.plusetf.co.kr/product/detail?n=006397',
        note: 'n 파라미터가 포함된 ETF 상품 페이지 URL을 입력하세요.',
    },
    {
        name: 'TIGER (미래에셋자산운용)',
        status: '지원',
        urlExample: 'https://investments.miraeasset.com/tigeretf/ko/product/search/detail/index.do?ksdFund=KR70168K0008',
        note: 'ksdFund 파라미터가 포함된 ETF 상품 페이지 URL을 입력하세요.',
    },
    {
        name: 'ACE (한국투자신탁운용)',
        status: '지원',
        urlExample: 'https://www.aceetf.co.kr/fund/K55101ES8039',
        note: 'URL 마지막 경로가 ETF ID입니다.',
    },
];

const AddEtfModal: React.FC<AddEtfModalProps> = ({ isOpen, onClose, onEtfAdded }) => {
    const [url, setUrl] = useState('');
    const [result, setResult] = useState<AddEtfResult | null>(null);
    const [loading, setLoading] = useState(false);

    if (!isOpen) return null;

    const handleAdd = async () => {
        const trimmed = url.trim();
        if (!trimmed) return;

        setLoading(true);
        setResult(null);

        try {
            const res = await invoke<AddEtfResult>('add_etf_from_url', { url: trimmed });
            setResult(res);
            if (res.status === 'added') {
                const ch = new BroadcastChannel('etf-settings');
                ch.postMessage({ type: 'etf-added' });
                ch.close();
                onEtfAdded();
            }
        } catch (e: any) {
            setResult({ status: 'error', etfName: null, message: String(e) });
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleAdd();
        if (e.key === 'Escape') onClose();
    };

    const resultColor =
        result?.status === 'added' ? '#4ade80'
        : result?.status === 'exists' ? '#fbbf24'
        : '#f87171';

    return (
        <div
            style={{
                position: 'fixed', inset: 0,
                background: 'rgba(0,0,0,0.6)',
                zIndex: 2000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div style={{
                background: '#1e293b',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '12px',
                padding: '28px 32px',
                width: '560px',
                maxWidth: '90vw',
                boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
                display: 'flex',
                flexDirection: 'column',
                gap: '20px',
            }}>
                {/* 헤더 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f1f5f9' }}>
                            Add New ETF
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>
                            ETF 상품 페이지 URL로 목록에 추가
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)',
                            fontSize: '1.2rem', cursor: 'pointer', padding: '4px',
                        }}
                    >✕</button>
                </div>

                {/* URL 입력 + 버튼 */}
                <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                        type="text"
                        value={url}
                        onChange={(e) => { setUrl(e.target.value); setResult(null); }}
                        onKeyDown={handleKeyDown}
                        placeholder="https://timeetf.co.kr/m11_view.php?idx=..."
                        autoFocus
                        style={{
                            flex: 1,
                            background: 'rgba(255,255,255,0.07)',
                            border: '1px solid rgba(255,255,255,0.15)',
                            borderRadius: '8px',
                            padding: '10px 14px',
                            color: '#f1f5f9',
                            fontSize: '0.85rem',
                            outline: 'none',
                        }}
                    />
                    <button
                        onClick={handleAdd}
                        disabled={loading || !url.trim()}
                        style={{
                            background: loading ? 'rgba(99,102,241,0.4)' : '#6366f1',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '10px 20px',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            cursor: loading || !url.trim() ? 'not-allowed' : 'pointer',
                            whiteSpace: 'nowrap',
                            transition: 'background 0.2s',
                        }}
                    >
                        {loading ? '확인 중...' : '추가'}
                    </button>
                </div>

                {/* 결과 메시지 */}
                {result && (
                    <div style={{
                        background: 'rgba(255,255,255,0.05)',
                        border: `1px solid ${resultColor}40`,
                        borderRadius: '8px',
                        padding: '10px 14px',
                        fontSize: '0.85rem',
                        color: resultColor,
                        fontWeight: 500,
                    }}>
                        {result.message}
                    </div>
                )}

                {/* 구분선 */}
                <div style={{ height: '1px', background: 'rgba(255,255,255,0.08)' }} />

                {/* 운용사 지원 현황 */}
                <div>
                    <div style={{
                        fontSize: '0.7rem',
                        color: 'rgba(255,255,255,0.35)',
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        fontWeight: 600,
                        marginBottom: '10px',
                    }}>
                        입력 가능한 운용사
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {SUPPORTED_MANAGERS.map((m) => (
                            <div key={m.name} style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '10px',
                                padding: '6px 10px',
                                borderRadius: '6px',
                                background: m.status === '지원' ? 'rgba(99,102,241,0.1)' : 'transparent',
                            }}>
                                <span style={{
                                    fontSize: '0.68rem',
                                    fontWeight: 600,
                                    padding: '2px 7px',
                                    borderRadius: '4px',
                                    whiteSpace: 'nowrap',
                                    background: m.status === '지원' ? '#6366f1' : 'rgba(255,255,255,0.08)',
                                    color: m.status === '지원' ? 'white' : 'rgba(255,255,255,0.3)',
                                    marginTop: '1px',
                                }}>
                                    {m.status}
                                </span>
                                <div>
                                    <div style={{ fontSize: '0.82rem', color: m.status === '지원' ? '#e2e8f0' : 'rgba(255,255,255,0.35)', fontWeight: m.status === '지원' ? 600 : 400 }}>
                                        {m.name}
                                    </div>
                                    <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.25)', marginTop: '1px', fontFamily: 'monospace' }}>
                                        {m.urlExample}
                                    </div>
                                    {m.note && (
                                        <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>
                                            {m.note}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AddEtfModal;
