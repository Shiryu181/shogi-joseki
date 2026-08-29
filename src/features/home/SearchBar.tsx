export interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

/** ホーム画面(§5.1)の検索バー。戦法名・かなでリアルタイム絞り込み。 */
export function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <div className="searchbar">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4-4" />
      </svg>
      <input
        type="text"
        placeholder="戦法名で検索(例:四間飛車)"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="戦法名で検索"
      />
    </div>
  );
}
