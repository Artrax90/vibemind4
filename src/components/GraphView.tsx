import React, { useEffect, useRef, useState, useCallback } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { Note } from '../types';
import { ZoomIn, ZoomOut, RotateCcw, Filter, X } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

type GraphViewProps = {
  notes: Note[];
  activeNoteId: string | null;
  onNodeClick: (noteId: string) => void;
};

export default function GraphView({ notes, activeNoteId, onNodeClick }: GraphViewProps) {
  const { t } = useLanguage();
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<any>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [mode, setMode] = useState<'force' | 'radial'>('force');

  useEffect(() => {
    if (containerRef.current) {
      setDimensions({
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight
      });
    }
    const handleResize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight
        });
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Extract all tags
  const allTags = React.useMemo(() => {
    const tagSet = new Set<string>();
    notes.forEach(n => {
      const matches = (n.content || '').match(/#[a-zA-Zа-яА-Я]+/g) || [];
      matches.forEach(t => tagSet.add(t.toLowerCase()));
    });
    return Array.from(tagSet).sort();
  }, [notes]);

  // Filter notes by tag
  const filteredNotes = React.useMemo(() => {
    if (!selectedTag) return notes;
    return notes.filter(n => (n.content || '').toLowerCase().includes(selectedTag));
  }, [notes, selectedTag]);

  // Generate graph data
  const graphData = React.useMemo(() => {
    const nodeIds = new Set(filteredNotes.map(n => n.id));
    const nodes = filteredNotes.map(n => ({
      id: n.id,
      name: n.title,
      val: 1,
      tag: (n.content || '').match(/#[a-zA-Zа-яА-Я]+/g)?.[0] || ''
    }));
    const links: any[] = [];

    filteredNotes.forEach(note => {
      const wikiLinkRegex = /\[\[(.*?)\]\]/g;
      let match;
      while ((match = wikiLinkRegex.exec(note.content)) !== null) {
        const targetTitle = match[1];
        const targetNote = filteredNotes.find(n => n.title.toLowerCase() === targetTitle.toLowerCase());
        if (targetNote && nodeIds.has(targetNote.id)) {
          links.push({ source: note.id, target: targetNote.id });
        }
      }
    });

    return { nodes, links };
  }, [filteredNotes]);

  const handleZoomIn = useCallback(() => {
    if (graphRef.current) {
      graphRef.current.zoom(1.5, 400);
    }
  }, []);

  const handleZoomOut = useCallback(() => {
    if (graphRef.current) {
      graphRef.current.zoom(0.67, 400);
    }
  }, []);

  const handleReset = useCallback(() => {
    if (graphRef.current) {
      graphRef.current.centerAt(0, 0, 400);
      graphRef.current.zoom(1, 400);
    }
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full bg-background relative">
      {/* Controls */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
        {/* Zoom controls */}
        <div className="flex items-center gap-1 rounded-full glass-strong p-1 shadow-premium ring-1 ring-border/50">
          <button onClick={handleZoomIn} className="p-1.5 rounded-full hover:bg-foreground/5 text-muted-foreground hover:text-foreground transition-colors">
            <ZoomIn size={14} />
          </button>
          <button onClick={handleZoomOut} className="p-1.5 rounded-full hover:bg-foreground/5 text-muted-foreground hover:text-foreground transition-colors">
            <ZoomOut size={14} />
          </button>
          <button onClick={handleReset} className="p-1.5 rounded-full hover:bg-foreground/5 text-muted-foreground hover:text-foreground transition-colors">
            <RotateCcw size={14} />
          </button>
        </div>

        {/* Filter toggle */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`p-1.5 rounded-full glass-strong shadow-premium ring-1 ring-border/50 transition-colors ${showFilters ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground hover:bg-foreground/5'}`}
        >
          <Filter size={14} />
        </button>

        {/* Mode toggle */}
        <div className="flex flex-col rounded-full glass-strong p-1 shadow-premium ring-1 ring-border/50">
          <button
            onClick={() => setMode('force')}
            className={`p-1.5 rounded-full text-[10px] font-bold transition-colors ${mode === 'force' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`}
          >
            F
          </button>
          <button
            onClick={() => setMode('radial')}
            className={`p-1.5 rounded-full text-[10px] font-bold transition-colors ${mode === 'radial' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`}
          >
            R
          </button>
        </div>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="absolute top-4 right-4 z-10 w-48 glass-strong rounded-xl shadow-premium-lg p-3 ring-1 ring-border/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-foreground">{t('graph.filterTags')}</span>
            <button onClick={() => setSelectedTag(null)} className="text-muted-foreground hover:text-foreground">
              <X size={12} />
            </button>
          </div>
          <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto scroll-elegant">
            {allTags.map(tag => (
              <button
                key={tag}
                onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                className={`px-2 py-0.5 rounded-full text-[10px] transition-colors ${selectedTag === tag ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
              >
                {tag}
              </button>
            ))}
          </div>
          {selectedTag && (
            <div className="mt-2 text-[10px] text-muted-foreground">
              {filteredNotes.length} / {notes.length} {t('graph.notes')}
            </div>
          )}
        </div>
      )}

      {/* Graph */}
      <ForceGraph2D
        ref={graphRef}
        width={dimensions.width}
        height={dimensions.height}
        graphData={graphData}
        nodeLabel="name"
        nodeColor={() => '#7C5CFF'}
        linkColor={() => '#94a3b8'}
        backgroundColor="transparent"
        onNodeClick={(node) => onNodeClick(node.id as string)}
        nodeRelSize={6}
        linkWidth={1.5}
        d3VelocityDecay={0.6}
        d3AlphaDecay={0.05}
        nodeCanvasObject={(node: any, ctx, globalScale) => {
          const label = node.name;
          const fontSize = 12 / globalScale;
          ctx.font = `${fontSize}px Geist, sans-serif`;

          const isActive = node.id === activeNoteId;
          const isHighlighted = selectedTag && node.tag === selectedTag;

          // Draw node circle
          ctx.beginPath();
          ctx.arc(node.x, node.y, isActive ? 8 : isHighlighted ? 7 : 5, 0, 2 * Math.PI, false);
          ctx.fillStyle = isActive ? '#10b981' : isHighlighted ? '#f59e0b' : '#7C5CFF';
          ctx.fill();

          // Glow for active
          if (isActive) {
            ctx.beginPath();
            ctx.arc(node.x, node.y, 12, 0, 2 * Math.PI, false);
            ctx.strokeStyle = '#10b98140';
            ctx.lineWidth = 2;
            ctx.stroke();
          }

          // Draw text
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillStyle = isActive ? '#10b981' : '#64748b';
          ctx.fillText(label, node.x, node.y + (isActive ? 10 : 8));
        }}
      />
    </div>
  );
}
