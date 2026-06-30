import React, { useState, useMemo } from 'react';
import { ArrowUpDown, Filter, Plus, Trash2, Download, Calculator } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

type TableEditorProps = {
  content: string;
  onChange: (content: string) => void;
  readOnly?: boolean;
};

type SortConfig = {
  column: number;
  direction: 'asc' | 'desc';
} | null;

export default function TableEditor({ content, onChange, readOnly = false }: TableEditorProps) {
  const { t } = useLanguage();
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  const [filterText, setFilterText] = useState('');
  const [editCell, setEditCell] = useState<{ row: number; col: number } | null>(null);
  const [editValue, setEditValue] = useState('');

  // Parse markdown table
  const { headers, rows } = useMemo(() => {
    const lines = content.split('\n').filter(l => l.trim().startsWith('|'));
    if (lines.length < 2) return { headers: [], rows: [] };

    const parseRow = (line: string) =>
      line.split('|').slice(1, -1).map(cell => cell.trim());

    const headers = parseRow(lines[0]);
    const rows = lines.slice(2).map(parseRow); // Skip separator line
    return { headers, rows };
  }, [content]);

  // Sort rows
  const sortedRows = useMemo(() => {
    if (!sortConfig) return rows;
    return [...rows].sort((a, b) => {
      const aVal = a[sortConfig.column] || '';
      const bVal = b[sortConfig.column] || '';
      const aNum = parseFloat(aVal);
      const bNum = parseFloat(bVal);
      if (!isNaN(aNum) && !isNaN(bNum)) {
        return sortConfig.direction === 'asc' ? aNum - bNum : bNum - aNum;
      }
      return sortConfig.direction === 'asc'
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal);
    });
  }, [rows, sortConfig]);

  // Filter rows
  const filteredRows = useMemo(() => {
    if (!filterText) return sortedRows;
    return sortedRows.filter(row =>
      row.some(cell => cell.toLowerCase().includes(filterText.toLowerCase()))
    );
  }, [sortedRows, filterText]);

  // Calculate column sums
  const columnStats = useMemo(() => {
    return headers.map((_, colIdx) => {
      const values = rows.map(r => parseFloat(r[colIdx])).filter(v => !isNaN(v));
      if (values.length === 0) return null;
      const sum = values.reduce((a, b) => a + b, 0);
      const avg = sum / values.length;
      return { sum, avg, count: values.length };
    });
  }, [headers, rows]);

  const handleSort = (colIdx: number) => {
    setSortConfig(prev =>
      prev?.column === colIdx
        ? { column: colIdx, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { column: colIdx, direction: 'asc' }
    );
  };

  const handleCellEdit = (rowIdx: number, colIdx: number, value: string) => {
    const newRows = rows.map((row, ri) =>
      ri === rowIdx ? row.map((cell, ci) => (ci === colIdx ? value : cell)) : row
    );
    const tableLines = [
      '| ' + headers.join(' | ') + ' |',
      '| ' + headers.map(() => '---').join(' | ') + ' |',
      ...newRows.map(row => '| ' + row.join(' | ') + ' |')
    ];
    // Replace table in content
    const tableRegex = /\|.*\|[\n\r]+\|[\s\-:|]+\|[\n\r]+(\|.*\|[\n\r]*)+/;
    const newContent = content.replace(tableRegex, tableLines.join('\n'));
    onChange(newContent);
    setEditCell(null);
  };

  const addRow = () => {
    const newRow = headers.map(() => '');
    const tableLines = [
      '| ' + headers.join(' | ') + ' |',
      '| ' + headers.map(() => '---').join(' | ') + ' |',
      ...rows.map(row => '| ' + row.join(' | ') + ' |'),
      '| ' + newRow.join(' | ') + ' |'
    ];
    const tableRegex = /\|.*\|[\n\r]+\|[\s\-:|]+\|[\n\r]+(\|.*\|[\n\r]*)+/;
    const newContent = content.replace(tableRegex, tableLines.join('\n'));
    onChange(newContent);
  };

  const deleteRow = (rowIdx: number) => {
    const newRows = rows.filter((_, i) => i !== rowIdx);
    const tableLines = [
      '| ' + headers.join(' | ') + ' |',
      '| ' + headers.map(() => '---').join(' | ') + ' |',
      ...newRows.map(row => '| ' + row.join(' | ') + ' |')
    ];
    const tableRegex = /\|.*\|[\n\r]+\|[\s\-:|]+\|[\n\r]+(\|.*\|[\n\r]*)+/;
    const newContent = content.replace(tableRegex, tableLines.join('\n'));
    onChange(newContent);
  };

  const exportCSV = () => {
    const csv = [
      headers.join(','),
      ...filteredRows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'table.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (headers.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-8">
        {t('table.noTable')}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      {!readOnly && (
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={addRow} className="flex items-center gap-1 px-2 py-1 text-xs rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
            <Plus size={12} /> {t('table.addRow')}
          </button>
          <button onClick={exportCSV} className="flex items-center gap-1 px-2 py-1 text-xs rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 transition-colors">
            <Download size={12} /> CSV
          </button>
          <div className="relative">
            <Filter size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder={t('table.filter')}
              className="pl-7 pr-2 py-1 text-xs rounded-lg bg-muted border border-border/50 text-foreground focus:outline-none focus:border-primary w-32"
            />
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border/50">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50">
              {headers.map((header, i) => (
                <th
                  key={i}
                  onClick={() => handleSort(i)}
                  className="px-3 py-2 text-left font-medium text-foreground cursor-pointer hover:bg-muted transition-colors select-none"
                >
                  <div className="flex items-center gap-1">
                    {header}
                    <ArrowUpDown size={10} className="text-muted-foreground" />
                    {sortConfig?.column === i && (
                      <span className="text-[10px] text-primary">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                  {columnStats[i] && (
                    <div className="text-[10px] text-muted-foreground font-normal mt-0.5">
                      Σ{columnStats[i]!.sum.toFixed(1)} | x̄{columnStats[i]!.avg.toFixed(1)}
                    </div>
                  )}
                </th>
              ))}
              {!readOnly && <th className="px-2 py-2 w-8"></th>}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row, rowIdx) => (
              <tr key={rowIdx} className="border-t border-border/30 hover:bg-muted/30">
                {row.map((cell, colIdx) => (
                  <td
                    key={colIdx}
                    onClick={() => !readOnly && setEditCell({ row: rowIdx, col: colIdx })}
                    className="px-3 py-2 text-foreground/80 cursor-pointer"
                  >
                    {editCell?.row === rowIdx && editCell?.col === colIdx ? (
                      <input
                        autoFocus
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => handleCellEdit(rowIdx, colIdx, editValue)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleCellEdit(rowIdx, colIdx, editValue);
                          if (e.key === 'Escape') setEditCell(null);
                        }}
                        className="w-full bg-background border border-primary rounded px-1 py-0.5 text-sm outline-none"
                      />
                    ) : (
                      <span>{cell}</span>
                    )}
                  </td>
                ))}
                {!readOnly && (
                  <td className="px-2 py-2">
                    <button
                      onClick={() => deleteRow(rowIdx)}
                      className="p-1 text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 size={12} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Stats */}
      {columnStats.some(s => s !== null) && (
        <div className="text-xs text-muted-foreground">
          {t('table.total')}: {rows.length} {t('table.rows')} | {t('table.filtered')}: {filteredRows.length}
        </div>
      )}
    </div>
  );
}
