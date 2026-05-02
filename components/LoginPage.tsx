import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { checkActiveSessions, createAdminSession, clearAllAdminSessions, verifyEmployeeCredentials } from '../services/database';
import { EmployeePageKey } from '../types';

interface LoginPageProps {
  onAdminLogin: (sessionId: string, readOnly: boolean) => void;
  onEmployeeLogin: (username: string, allowedTabs: EmployeePageKey[], hideFinancialData: boolean) => void;
  language: 'zh' | 'en';
}

export const LoginPage: React.FC<LoginPageProps> = ({ onAdminLogin, onEmployeeLogin, language }) => {
  const ADMIN_USERNAME = 'admin';
  const ADMIN_PASSWORD = '0000';

  const [status, setStatus] = useState<'idle' | 'checking' | 'conflict' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [loginMode, setLoginMode] = useState<'admin' | 'employee'>('admin');
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [employeeUsername, setEmployeeUsername] = useState('');
  const [employeePassword, setEmployeePassword] = useState('');

  const handleSignIn = async () => {
    const normalizedUsername = adminUsername.trim().toLowerCase();
    const normalizedPassword = adminPassword.trim();

    if (normalizedUsername !== ADMIN_USERNAME || normalizedPassword !== ADMIN_PASSWORD) {
      setStatus('error');
      setError(language === 'zh' ? '管理員用戶名或密碼錯誤' : 'Invalid admin username or password');
      return;
    }

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
          onAdminLogin(sessionId, false);
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
        onAdminLogin(sessionId, false);
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
    onAdminLogin('readonly', true);
  };

  const handleEmployeeSignIn = async () => {
    setStatus('checking');
    setError(null);

    const result = await verifyEmployeeCredentials(employeeUsername, employeePassword);
    if (!result.success || !result.user) {
      setStatus('error');
      setError(result.error || (language === 'zh' ? '用戶名或密碼錯誤' : 'Invalid username or password'));
      return;
    }

    onEmployeeLogin(
      result.user.username,
      result.allowedPageKeys || [],
      result.user.hideFinancialData
    );
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
              {loginMode === 'admin'
                ? (language === 'zh' ? '管理員登錄' : 'Admin Login')
                : (language === 'zh' ? '員工登錄' : 'Employee Login')}
            </h1>
            <p className="text-slate-500 dark:text-slate-400">
              {loginMode === 'admin'
                ? (language === 'zh' ? '請登錄以訪問管理面板' : 'Please sign in to access the admin panel')
                : (language === 'zh' ? '請輸入員工帳號密碼' : 'Please enter employee credentials')}
            </p>
          </div>

          <div className="mb-6 bg-slate-100 dark:bg-white/5 rounded-2xl p-1 flex">
            <button
              onClick={() => {
                setLoginMode('admin');
                setStatus('idle');
                setError(null);
              }}
              className={`flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${loginMode === 'admin' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}
            >
              {language === 'zh' ? '管理員' : 'Admin'}
            </button>
            <button
              onClick={() => {
                setLoginMode('employee');
                setStatus('idle');
                setError(null);
              }}
              className={`flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${loginMode === 'employee' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}
            >
              {language === 'zh' ? '員工' : 'Employee'}
            </button>
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
              {loginMode === 'admin' ? (
                <div className="space-y-3">
                  <input
                    type="text"
                    value={adminUsername}
                    onChange={(e) => setAdminUsername(e.target.value)}
                    placeholder={language === 'zh' ? '管理員用戶名' : 'Admin username'}
                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white font-semibold outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <input
                    type="password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder={language === 'zh' ? '管理員密碼' : 'Admin password'}
                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white font-semibold outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    onClick={handleSignIn}
                    disabled={status === 'checking' || !adminUsername.trim() || !adminPassword.trim()}
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
              ) : (
                <div className="space-y-3">
                  <input
                    type="text"
                    value={employeeUsername}
                    onChange={(e) => setEmployeeUsername(e.target.value)}
                    placeholder={language === 'zh' ? '用戶名' : 'Username'}
                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white font-semibold outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="password"
                    value={employeePassword}
                    onChange={(e) => setEmployeePassword(e.target.value)}
                    placeholder={language === 'zh' ? '密碼' : 'Password'}
                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white font-semibold outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={handleEmployeeSignIn}
                    disabled={status === 'checking' || !employeeUsername.trim() || !employeePassword.trim()}
                    className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-2xl font-semibold transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2"
                  >
                    {status === 'checking' ? (
                      <i className="fas fa-circle-notch fa-spin"></i>
                    ) : (
                      <i className="fas fa-user"></i>
                    )}
                    {language === 'zh' ? '員工登錄' : 'Employee Sign In'}
                  </button>
                </div>
              )}
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
