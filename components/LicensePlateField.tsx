import React, { useEffect, useMemo, useState } from 'react';
import { normalizeLicensePlate } from '../utils/licensePlate';

interface LicensePlateFieldProps {
  value: string;
  onChange: (value: string) => void;
  language: 'zh' | 'en';
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  action?: React.ReactNode;
  onPlateKeyboardModeChange?: (enabled: boolean) => void;
}

const PLATE_PROVINCE_KEYS = ['粤', '京', '津', '沪', '渝', '冀', '豫', '云', '辽', '黑', '湘', '皖', '鲁', '新', '苏', '浙', '赣', '鄂', '桂', '甘', '晋', '蒙', '陕', '吉', '闽', '贵', '青', '藏', '川', '宁', '琼', '使', '无'];
const PLATE_ALPHA_KEYS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

const LicensePlateField: React.FC<LicensePlateFieldProps> = ({
  value,
  onChange,
  language,
  label,
  placeholder,
  disabled,
  action,
  onPlateKeyboardModeChange,
}) => {
  const [usePlateKeyboard, setUsePlateKeyboard] = useState(false);

  useEffect(() => {
    onPlateKeyboardModeChange?.(usePlateKeyboard);
  }, [usePlateKeyboard, onPlateKeyboardModeChange]);

  const normalizedPlate = useMemo(() => normalizeLicensePlate(value), [value]);
  const plateChars = Array.from({ length: 8 }, (_, index) => normalizedPlate[index] || '');
  const nextPlateIndex = Math.min(normalizedPlate.length, 7);
  const plateKeyboardKeys = normalizedPlate.length === 0 ? PLATE_PROVINCE_KEYS : PLATE_ALPHA_KEYS;

  const updatePlateValue = (nextValue: string) => {
    onChange(normalizeLicensePlate(nextValue));
  };

  const handlePlateKey = (key: string) => {
    if (normalizedPlate.length >= 8) return;
    updatePlateValue(`${normalizedPlate}${key}`);
  };

  const handlePlateBackspace = () => {
    updatePlateValue(normalizedPlate.slice(0, -1));
  };

  return (
    <div className="space-y-3 rounded-[28px] border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <label className="text-lg font-black text-slate-900 dark:text-white">
          {label || (language === 'zh' ? '請輸入車牌' : 'Enter License Plate')}
        </label>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setUsePlateKeyboard(prev => !prev)}
          className={`px-4 h-10 rounded-full text-[11px] font-black uppercase tracking-widest border disabled:opacity-50 ${usePlateKeyboard ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-300 dark:bg-slate-900 dark:text-slate-200 dark:border-white/10'}`}
        >
          {language === 'zh' ? '切換車牌鍵盤' : 'Switch'}
        </button>
      </div>

      {!usePlateKeyboard ? (
        <div className="flex items-center gap-2">
          <input
            value={normalizedPlate}
            disabled={disabled}
            onChange={event => updatePlateValue(event.target.value)}
            placeholder={placeholder || (language === 'zh' ? '車牌號碼' : 'License Plate Number')}
            className="w-full h-14 rounded-2xl border border-slate-300 dark:border-white/10 bg-white dark:bg-slate-900 px-4 text-lg font-bold tracking-[0.12em] text-slate-900 dark:text-white disabled:opacity-50"
          />
          {action}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <div className="w-14 h-16 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 flex items-center justify-center text-2xl font-black text-slate-900 dark:text-white">{plateChars[0]}</div>
            <div className="w-14 h-16 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 flex items-center justify-center text-2xl font-black text-slate-900 dark:text-white">{plateChars[1]}</div>
            <div className="w-4 flex items-center justify-center text-slate-500 text-2xl">•</div>
            <div className="w-14 h-16 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 flex items-center justify-center text-2xl font-black text-slate-900 dark:text-white">{plateChars[2]}</div>
            <div className="w-14 h-16 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 flex items-center justify-center text-2xl font-black text-slate-900 dark:text-white">{plateChars[3]}</div>
            <div className="w-14 h-16 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 flex items-center justify-center text-2xl font-black text-slate-900 dark:text-white">{plateChars[4]}</div>
            <div className="w-14 h-16 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 flex items-center justify-center text-2xl font-black text-slate-900 dark:text-white">{plateChars[5]}</div>
            <div className="w-14 h-16 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 flex items-center justify-center text-2xl font-black text-slate-900 dark:text-white">{plateChars[6]}</div>
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-400 flex items-center justify-center text-sm font-black text-emerald-600 dark:text-emerald-300 text-center leading-tight px-1">
              {plateChars[7] || (language === 'zh' ? '新能源' : 'EV')}
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
            <span>{language === 'zh' ? `輸入位置 ${nextPlateIndex + 1}` : `Position ${nextPlateIndex + 1}`}</span>
            <button type="button" onClick={() => updatePlateValue('')} className="text-slate-500 dark:text-slate-300">
              {language === 'zh' ? '清除' : 'Clear'}
            </button>
          </div>

          <div className="grid grid-cols-7 md:grid-cols-9 gap-2 rounded-[28px] bg-[#d7dbe3] dark:bg-slate-800 p-3">
            {plateKeyboardKeys.map(key => (
              <button
                key={key}
                type="button"
                onClick={() => handlePlateKey(key)}
                className="h-12 rounded-2xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-black text-xl shadow-sm"
              >
                {key}
              </button>
            ))}
            <button
              type="button"
              onClick={handlePlateBackspace}
              className="col-span-2 md:col-span-2 h-12 rounded-2xl bg-slate-300 dark:bg-slate-700 text-slate-900 dark:text-white font-black text-sm uppercase tracking-widest"
            >
              <i className="fas fa-delete-left mr-2"></i>
              {language === 'zh' ? '刪除' : 'Delete'}
            </button>
            <button
              type="button"
              onClick={() => setUsePlateKeyboard(false)}
              className="col-span-2 md:col-span-2 h-12 rounded-2xl bg-blue-500 text-white font-black text-sm uppercase tracking-widest"
            >
              {language === 'zh' ? '完成' : 'Done'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default LicensePlateField;