import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface ChangelogModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const ChangelogModal: React.FC<ChangelogModalProps> = ({ isOpen, onClose }) => {
    const [content, setContent] = useState<string>('');
    const [loading, setLoading] = useState<boolean>(true);

    useEffect(() => {
        if (isOpen) {
            setLoading(true);
            invoke<string>('get_changelog')
                .then(setContent)
                .catch(err => setContent('변경 이력을 불러오는 데 실패했습니다: ' + err))
                .finally(() => setLoading(false));
        }
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            backdropFilter: 'blur(4px)'
        }} onClick={onClose}>
            <div style={{
                width: '600px',
                maxHeight: '80vh',
                backgroundColor: '#1e293b',
                borderRadius: '12px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                overflow: 'hidden'
            }} onClick={e => e.stopPropagation()}>
                <div style={{
                    padding: '20px',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                }}>
                    <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'white' }}>변경 이력 (Changelog)</h2>
                    <button 
                        onClick={onClose}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#94a3b8',
                            fontSize: '1.5rem',
                            cursor: 'pointer',
                            lineHeight: 1
                        }}
                    >×</button>
                </div>
                <div style={{
                    padding: '20px',
                    overflowY: 'auto',
                    flex: 1,
                    color: '#cbd5e1',
                    fontSize: '0.95rem',
                    lineHeight: '1.6',
                    whiteSpace: 'pre-wrap',
                    fontFamily: 'inherit'
                }}>
                    {loading ? '로딩 중...' : content}
                </div>
                <div style={{
                    padding: '15px 20px',
                    borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                    textAlign: 'right'
                }}>
                    <button 
                        onClick={onClose}
                        style={{
                            padding: '8px 16px',
                            backgroundColor: 'var(--primary-color)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontWeight: 600
                        }}
                    >닫기</button>
                </div>
            </div>
        </div>
    );
};

export default ChangelogModal;
