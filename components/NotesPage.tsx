
import React, { useState } from 'react';
import { Note } from '../types';
import { translations } from '../translations';
import { motion, AnimatePresence } from 'motion/react';

interface NotesPageProps {
  notes: Note[];
  onAdd: (note: Omit<Note, 'id' | 'createdAt'>) => void;
  onUpdate: (note: Note) => void;
  onDelete: (id: string) => void;
  language: 'zh' | 'en';
  isReadOnly?: boolean;
}

const COLORS = [
  '#FEF3C7', // Yellow
  '#DBEAFE', // Blue
  '#D1FAE5', // Green
  '#FEE2E2', // Red
  '#F3E8FF', // Purple
  '#FFEDD5', // Orange
];

const NotesPage: React.FC<NotesPageProps> = ({ notes, onAdd, onUpdate, onDelete, language, isReadOnly }) => {
  const t = translations[language];
  const [isAdding, setIsAdding] = useState(false);
  const [showCopyToast, setShowCopyToast] = useState(false);
  const [newNote, setNewNote] = useState({ title: '', content: '', color: COLORS[0], isPinned: false, reminderDate: '' });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.content.trim()) return;
    onAdd(newNote);
    setNewNote({ title: '', content: '', color: COLORS[0], isPinned: false, reminderDate: '' });
    setIsAdding(false);
  };

  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content).then(() => {
      setShowCopyToast(true);
      setTimeout(() => setShowCopyToast(false), 2000);
    });
  };

  const sortedNotes = [...notes].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <div className="max-w-6xl mx-auto space-y-8 relative">
      {isReadOnly && (
        <div className="bg-rose-50 dark:bg-rose-900/10 border border-rose-200 dark:border-rose-800/20 rounded-2xl p-4 flex items-center gap-3 text-rose-600 dark:text-rose-400">
          <i className="fas fa-lock text-sm"></i>
          <span className="text-xs font-bold uppercase tracking-widest">
            {language === 'zh' ? '連接不穩定，目前處於唯讀模式。' : 'Connection unstable. Currently in Read-Only mode.'}
          </span>
        </div>
      )}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">{t.notes}</h2>
          <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-1">{notes.length} {t.items}</p>
        </div>
        {!isReadOnly && (
          <button 
            onClick={() => setIsAdding(true)}
            className="bg-blue-600 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-blue-600/20 active:scale-95 transition-all flex items-center gap-2"
          >
            <i className="fas fa-plus"></i> {t.addNote}
          </button>
        )}
      </div>

      <AnimatePresence>
        {showCopyToast && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-24 right-6 md:bottom-10 md:right-10 z-[300] bg-slate-900 text-white px-6 py-3 rounded-2xl shadow-2xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 border border-white/10"
          >
            <i className="fas fa-check-circle text-emerald-400"></i> {t.copiedToClipboard}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isAdding && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/60 backdrop-blur-md p-4"
          >
            <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-[32px] shadow-2xl p-8 space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-black text-slate-900 dark:text-white">{t.addNote}</h3>
                <button onClick={() => setIsAdding(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><i className="fas fa-times"></i></button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <input 
                  type="text" 
                  placeholder={t.noteTitle}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 text-sm font-bold outline-none dark:text-white"
                  value={newNote.title}
                  onChange={e => setNewNote({...newNote, title: e.target.value})}
                />
                <textarea 
                  placeholder={t.noteContent}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 text-sm font-bold outline-none dark:text-white min-h-[150px]"
                  value={newNote.content}
                  onChange={e => setNewNote({...newNote, content: e.target.value})}
                />
                <div className="flex flex-wrap gap-2">
                  {COLORS.map(c => (
                    <button 
                      key={c}
                      type="button"
                      onClick={() => setNewNote({...newNote, color: c})}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${newNote.color === c ? 'border-blue-500 scale-110' : 'border-transparent'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">{t.reminder}</label>
                  <input 
                    type="date" 
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 text-sm font-bold outline-none dark:text-white"
                    value={newNote.reminderDate}
                    onChange={e => setNewNote({...newNote, reminderDate: e.target.value})}
                  />
                </div>
                <button type="submit" className="w-full bg-blue-600 text-white font-black py-4 rounded-2xl text-xs uppercase tracking-widest shadow-lg active:scale-95 transition-all">{t.save}</button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {sortedNotes.map(note => (
          <motion.div 
            layout
            key={note.id}
            onClick={() => handleCopy(note.content)}
            className="relative group p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-white/5 transition-all hover:shadow-xl hover:-translate-y-1 cursor-pointer active:scale-[0.98]"
            style={{ backgroundColor: note.color }}
          >
            <div className="flex justify-between items-start mb-4">
              <div className="flex-1">
                {note.title && <h3 className="font-black text-slate-900 text-lg leading-tight mb-1">{note.title}</h3>}
                <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{new Date(note.createdAt).toLocaleDateString()}</div>
              </div>
              <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                {!isReadOnly && (
                  <>
                    <button 
                      onClick={() => onUpdate({...note, isPinned: !note.isPinned})}
                      className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${note.isPinned ? 'bg-slate-900 text-white' : 'bg-white/50 text-slate-400 hover:text-slate-600'}`}
                    >
                      <i className={`fas fa-thumbtack text-xs ${note.isPinned ? '' : 'rotate-45'}`}></i>
                    </button>
                    <button 
                      onClick={() => onDelete(note.id)}
                      className="w-8 h-8 rounded-full bg-white/50 text-slate-400 hover:text-rose-500 flex items-center justify-center transition-all"
                    >
                      <i className="fas fa-trash text-xs"></i>
                    </button>
                  </>
                )}
              </div>
            </div>
            <p className="text-slate-800 font-bold text-sm whitespace-pre-wrap leading-relaxed mb-6">{note.content}</p>
            
            <div className="flex items-center justify-between">
              {note.reminderDate ? (
                <div className="flex items-center gap-2 bg-white/40 px-3 py-1.5 rounded-xl w-fit">
                  <i className={`fas fa-bell text-[10px] ${new Date(note.reminderDate) <= new Date() ? 'text-rose-600 animate-pulse' : 'text-slate-600'}`}></i>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-700">{note.reminderDate}</span>
                </div>
              ) : <div />}
              <div className="opacity-0 group-hover:opacity-40 transition-opacity">
                <i className="fas fa-copy text-xs text-slate-900"></i>
              </div>
            </div>
          </motion.div>
        ))}
        {notes.length === 0 && (
          <div className="col-span-full py-20 text-center">
            <div className="w-20 h-20 bg-slate-100 dark:bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6">
              <i className="fas fa-sticky-note text-slate-300 text-3xl"></i>
            </div>
            <p className="text-slate-400 font-black uppercase tracking-[0.2em]">{t.noNotes}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default NotesPage;
