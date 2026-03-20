import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { checkActiveSessions, createAdminSession, clearAllAdminSessions } from '../services/database';

interface LoginPageProps {
  onLogin: (sessionId: string, readOnly: boolean) => void;
  language: 'zh' | 'en';
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLogin, language }) => {
  const [status, setStatus] = useState<'idle' | 'checking' | 'conflict' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    setStatus('checking');
    setError(null);

    try {
      const { active, error: sessionError } = await checkActiveSessions();
      
      if (sessionError) {
        setStatus('error');
        setError(sessionError);
        return;
      }

      if (active) {
        setStatus('conflict');
      } else {
        const sessionId = Math.random().toString(36).substr(2, 9);
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        const { success, error: createError } = await createAdminSession('default', sessionId, expiresAt);
        if (success) {
          onLogin(sessionId, false);
        } else {
          setStatus('error');
          setError(createError || 'Failed to create session');
        }
      }
    } catch (e: any) {
      setStatus('error');
      setError(e.message);
    }
  };

  const handleForceLogin = async () => {
    setStatus('checking');
    try {
      await clearAllAdminSessions();
      const sessionId = Math.random().toString(36).substr(2, 9);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const { success, error: createError } = await createAdminSession('default', sessionId, expiresAt);
      if (success) {
        onLogin(sessionId, false);
      } else {
        setStatus('error');
        setError(createError || 'Failed to create session');
      }
    } catch (e: any) {
      setStatus('error');
      setError(e.message);
    }
  };

  const handleReadOnly = () => {
    onLogin('readonly', true);
  };

  return (
    <div className="fixed inset-0 bg-slate-900 flex items-center justify-center z-[100] p-4">
      <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-3xl shadow-2xl overflow-hidden">
        <div className="p-8 text-center">
          {/* Brand Identity */}
          <div className="mb-8">
            <div className="w-24 h-24 bg-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm border border-slate-100">
              <div className="flex flex-col items-center justify-center leading-none scale-[1.5]">
                <span className="text-[12px] font-serif font-black text-black tracking-tighter">GARDINER</span>
                <span className="text-[10px] font-black text-black mt-0.5">尚洗</span>
              </div>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
              {language === 'zh' ? '管理員登錄' : 'Admin Login'}
            </h1>
            <p className="text-slate-500 dark:text-slate-400">
              {language === 'zh' ? '請登錄以訪問管理面板' : 'Please sign in to access the admin panel'}
            </p>
          </div>

          {/* Connection Status */}
          <div className="mb-8 flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest">
            <div className={`w-2 h-2 rounded-full ${navigator.onLine ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
            <span className={navigator.onLine ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
              {navigator.onLine ? (language === 'zh' ? '網絡已連接' : 'Online') : (language === 'zh' ? '網絡已斷開' : 'Offline')}
            </span>
          </div>

          {status === 'idle' || status === 'checking' ? (
            <div>
              <button
                onClick={handleSignIn}
                disabled={status === 'checking'}
                className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-300 text-white rounded-2xl font-semibold transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
              >
                {status === 'checking' ? (
                  <i className="fas fa-circle-notch fa-spin"></i>
                ) : (
                  <i className="fas fa-sign-in-alt"></i>
                )}
                {language === 'zh' ? '以管理員身份登錄' : 'Sign in as Admin'}
              </button>
            </div>
          ) : status === 'conflict' ? (
            <div className="space-y-4">
              <div className="p-4 bg-rose-50 dark:bg-rose-900/20 rounded-2xl text-rose-600 dark:text-rose-400 text-sm mb-6">
                <i className="fas fa-exclamation-triangle mr-2"></i>
                {language === 'zh' ? '登錄失敗：已有其他管理員在線' : 'Login failed: Another admin is currently online'}
              </div>
              
              <button
                onClick={handleReadOnly}
                className="w-full py-4 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 rounded-2xl font-semibold transition-all flex items-center justify-center gap-2"
              >
                <i className="fas fa-eye"></i>
                {language === 'zh' ? '以唯讀模式打開' : 'Open Read-Only Mode'}
              </button>
              
              <button
                onClick={handleForceLogin}
                className="w-full py-4 bg-rose-500 hover:bg-rose-600 text-white rounded-2xl font-semibold transition-all shadow-lg shadow-rose-500/20 flex items-center justify-center gap-2"
              >
                <i className="fas fa-sign-out-alt"></i>
                {language === 'zh' ? '註銷所有會話並登錄編輯模式' : 'Logout all sessions and log in to Edit Mode'}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 bg-rose-50 dark:bg-rose-900/20 rounded-2xl text-rose-600 dark:text-rose-400 text-sm">
                {error}
              </div>
              <button
                onClick={() => setStatus('idle')}
                className="w-full py-4 bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 rounded-2xl font-semibold"
              >
                {language === 'zh' ? '重試' : 'Retry'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
