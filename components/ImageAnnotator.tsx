
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { saveAs } from 'file-saver';
import { UploadIcon, DownloadIcon, RectangleIcon, TypeIcon, ArrowUpRightIcon, MoveIcon, ZoomInIcon, EraserIcon } from './Icons';

type Tool = 'select' | 'rect' | 'text' | 'arrow' | 'zoom' | 'eraser';
type Annotation = {
    id: string;
    type: 'rect' | 'arrow' | 'text' | 'eraser';
    color: string;
    x: number;
    y: number;
    width: number;
    height: number;
    text?: string;
    fontSize?: number;
    path?: { x: number; y: number }[];
    strokeWidth?: number;
};

interface ImageFile { file: File; previewUrl: string; naturalWidth: number; naturalHeight: number; }
const MARKUP_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#ffffff', '#000000'];
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 5;

// Helper function to calculate text block height based on wrapping
const getTextBlockHeight = (context: CanvasRenderingContext2D, text: string, maxWidth: number, fontSize: number, lineHeight: number) => {
    const words = text.split(' ');
    let line = '';
    let lines = 1;
    
    for(let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = context.measureText(testLine);
      const testWidth = metrics.width;
      if (testWidth > maxWidth && n > 0) {
        lines++;
        line = words[n] + ' ';
      } else {
        line = testLine;
      }
    }
    return lines * lineHeight;
};


// Helper function to wrap text on canvas
const wrapText = (context: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) => {
    const words = text.split(' ');
    let line = '';
    
    for(let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = context.measureText(testLine);
      const testWidth = metrics.width;
      if (testWidth > maxWidth && n > 0) {
        context.fillText(line, x, y);
        line = words[n] + ' ';
        y += lineHeight;
      } else {
        line = testLine;
      }
    }
    context.fillText(line, x, y);
};

const ImageAnnotator: React.FC = () => {
    const [image, setImage] = useState<ImageFile | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    
    const [tool, setTool] = useState<Tool>('rect');
    const [color, setColor] = useState(MARKUP_COLORS[0]);
    const [eraserSize, setEraserSize] = useState(20);
    const [annotations, setAnnotations] = useState<Annotation[]>([]);
    const [drawingAnnotation, setDrawingAnnotation] = useState<Annotation | null>(null);
    const [editingAnnotation, setEditingAnnotation] = useState<Annotation | null>(null);
    const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
    
    const [zoom, setZoom] = useState(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const imageRef = useRef<HTMLImageElement>(new Image());

    const isPointerDown = useRef(false);
    const startPan = useRef({ x: 0, y: 0 });
    const startPoint = useRef({ x: 0, y: 0 });
    const dragStartAnnotationPos = useRef<{ x: number; y: number } | null>(null);
    const zoomStartPointY = useRef(0);
    const startZoom = useRef(1);

    const processFile = (file: File | null) => {
        // Handle resetting the component state
        if (file === null) {
            if (image) {
                URL.revokeObjectURL(image.previewUrl);
            }
            setImage(null);
            setAnnotations([]);
            setDrawingAnnotation(null);
            setEditingAnnotation(null);
            setSelectedAnnotationId(null);
            setError(null);
            return;
        }

        // Handle invalid file type
        if (!file.type.startsWith('image/')) {
            setError('Apenas arquivos de imagem são aceitos.');
            return;
        }

        // Process the new valid file
        setError(null);
        setAnnotations([]);
        setDrawingAnnotation(null);
        setEditingAnnotation(null);
        setSelectedAnnotationId(null);
        setZoom(1);
        setOffset({ x: 0, y: 0 });
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            imageRef.current = img;
            setImage({ file, previewUrl: url, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight });
        };
        img.src = url;
    };
    
    const getTransformedPoint = (x: number, y: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const ctx = canvas.getContext('2d')!;
        const transform = ctx.getTransform();
        const invertedTransform = transform.inverse();
        const transformedPoint = new DOMPoint(x, y).matrixTransform(invertedTransform);
        return { x: transformedPoint.x, y: transformedPoint.y };
    };
    
    const worldToScreen = (x: number, y: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const ctx = canvas.getContext('2d')!;
        const transform = ctx.getTransform();
        const screenPoint = new DOMPoint(x, y).matrixTransform(transform);
        return { x: screenPoint.x, y: screenPoint.y };
    };

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas || !image) return;
        const ctx = canvas.getContext('2d')!;
        
        canvas.width = canvas.parentElement!.clientWidth;
        canvas.height = canvas.parentElement!.clientHeight;

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        ctx.translate(canvas.width / 2 + offset.x, canvas.height / 2 + offset.y);
        ctx.scale(zoom, zoom);
        ctx.translate(-image.naturalWidth / 2, -image.naturalHeight / 2);
        
        ctx.drawImage(imageRef.current, 0, 0);

        [...annotations, drawingAnnotation].forEach(ann => {
            if (!ann || ann.id === editingAnnotation?.id) return;
            ctx.strokeStyle = ann.color;
            ctx.fillStyle = ann.color;
            ctx.lineWidth = Math.max(4 / zoom, 2);

            switch (ann.type) {
                case 'rect':
                    ctx.strokeRect(ann.x, ann.y, ann.width, ann.height);
                    break;
                case 'arrow':
                    const headlen = Math.max(15 / zoom, 8);
                    const dx = ann.x + ann.width - ann.x;
                    const dy = ann.y + ann.height - ann.y;
                    const angle = Math.atan2(dy, dx);
                    ctx.beginPath(); ctx.moveTo(ann.x, ann.y); ctx.lineTo(ann.x + ann.width, ann.y + ann.height);
                    ctx.lineTo(ann.x + ann.width - headlen * Math.cos(angle - Math.PI / 6), ann.y + ann.height - headlen * Math.sin(angle - Math.PI / 6));
                    ctx.moveTo(ann.x + ann.width, ann.y + ann.height);
                    ctx.lineTo(ann.x + ann.width - headlen * Math.cos(angle + Math.PI / 6), ann.y + ann.height - headlen * Math.sin(angle + Math.PI / 6));
                    ctx.stroke();
                    break;
                case 'text':
                    ctx.font = `${ann.fontSize}px sans-serif`;
                    ctx.textBaseline = 'top';
                    wrapText(ctx, ann.text || '', ann.x, ann.y, ann.width, ann.fontSize! * 1.2);
                    break;
                case 'eraser':
                    ctx.globalCompositeOperation = 'destination-out';
                    ctx.strokeStyle = 'rgba(0,0,0,1)';
                    ctx.lineWidth = ann.strokeWidth!;
                    ctx.lineCap = 'round';
                    ctx.lineJoin = 'round';
                    if (ann.path && ann.path.length > 1) {
                        ctx.beginPath();
                        ctx.moveTo(ann.path[0].x, ann.path[0].y);
                        for (let i = 1; i < ann.path.length; i++) {
                            ctx.lineTo(ann.path[i].x, ann.path[i].y);
                        }
                        ctx.stroke();
                    }
                    ctx.globalCompositeOperation = 'source-over';
                    break;
            }
        });

        const selectedAnn = annotations.find(a => a.id === selectedAnnotationId);
        if (selectedAnn && !editingAnnotation) {
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = Math.max(2 / zoom, 1);
            ctx.setLineDash([6 / zoom, 3 / zoom]);
            ctx.strokeRect(selectedAnn.x, selectedAnn.y, selectedAnn.width, selectedAnn.height);
            ctx.setLineDash([]);
        }
    }, [image, annotations, zoom, offset, drawingAnnotation, editingAnnotation, selectedAnnotationId]);
    
    useEffect(() => {
        const handleResize = () => draw();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [draw]);

    useEffect(draw, [draw]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.key === 'Delete' || e.key === 'Backspace') && selectedAnnotationId) {
                if (document.activeElement?.tagName.toLowerCase() === 'textarea') return;
                setAnnotations(prev => prev.filter(a => a.id !== selectedAnnotationId));
                setSelectedAnnotationId(null);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedAnnotationId]);

    const finishEditingText = useCallback(() => {
        if (!editingAnnotation) return;
        
        const finalAnnotation = { ...editingAnnotation };
        const textIsEmpty = finalAnnotation.text?.trim() === '';

        if (textIsEmpty) {
            setAnnotations(prev => prev.filter(a => a.id !== finalAnnotation.id));
        } else {
            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d')!;
            tempCtx.font = `${finalAnnotation.fontSize}px sans-serif`;
            finalAnnotation.height = getTextBlockHeight(tempCtx, finalAnnotation.text!, finalAnnotation.width, finalAnnotation.fontSize!, finalAnnotation.fontSize! * 1.2);
            
            const isExisting = annotations.some(a => a.id === finalAnnotation.id);
            if (isExisting) {
                setAnnotations(prev => prev.map(a => a.id === finalAnnotation.id ? finalAnnotation : a));
            } else {
                setAnnotations(prev => [...prev, finalAnnotation]);
            }
        }
        setEditingAnnotation(null);
    }, [editingAnnotation, annotations]);

    const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
        isPointerDown.current = true;
        startPan.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
        zoomStartPointY.current = e.clientY;
        startZoom.current = zoom;

        const rect = e.currentTarget.getBoundingClientRect();
        const point = getTransformedPoint(e.clientX - rect.left, e.clientY - rect.top);
        startPoint.current = point;

        if (tool === 'select') {
            const hitAnnotation = [...annotations].reverse().find(ann => {
                const x1 = ann.x, y1 = ann.y;
                const x2 = ann.x + ann.width, y2 = ann.y + ann.height;
                return point.x >= x1 && point.x <= x2 && point.y >= y1 && point.y <= y2;
            });

            if (editingAnnotation && editingAnnotation.id !== hitAnnotation?.id) {
                finishEditingText();
            }

            if (hitAnnotation) {
                setSelectedAnnotationId(hitAnnotation.id);
                dragStartAnnotationPos.current = { x: hitAnnotation.x, y: hitAnnotation.y };
            } else {
                setSelectedAnnotationId(null);
            }
        } else if (tool === 'eraser') {
            setDrawingAnnotation({
                id: `temp-eraser`, type: 'eraser', color: 'black',
                path: [point], strokeWidth: eraserSize,
                x:0, y:0, width:0, height:0,
            });
        }
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!isPointerDown.current || !image) return;

        if (tool === 'zoom') {
            const deltaY = zoomStartPointY.current - e.clientY;
            const SENSITIVITY = 0.005;
            const newZoom = startZoom.current * Math.exp(deltaY * SENSITIVITY);
            setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, newZoom)));
        } else if (tool === 'select' && !selectedAnnotationId) {
            setOffset({ x: e.clientX - startPan.current.x, y: e.clientY - startPan.current.y });
        } else {
            const rect = e.currentTarget.getBoundingClientRect();
            const point = getTransformedPoint(e.clientX - rect.left, e.clientY - rect.top);

            if (tool === 'select' && selectedAnnotationId && dragStartAnnotationPos.current) {
                const dx = point.x - startPoint.current.x;
                const dy = point.y - startPoint.current.y;
                setAnnotations(prev => prev.map(ann => 
                    ann.id === selectedAnnotationId 
                    ? { ...ann, x: dragStartAnnotationPos.current.x + dx, y: dragStartAnnotationPos.current.y + dy } 
                    : ann
                ));
            } else if (tool === 'rect' || tool === 'arrow') {
                 setDrawingAnnotation({
                    id: `temp-${Date.now()}`, type: tool, color,
                    x: startPoint.current.x, y: startPoint.current.y,
                    width: point.x - startPoint.current.x, height: point.y - startPoint.current.y,
                });
            } else if (tool === 'eraser' && drawingAnnotation) {
                setDrawingAnnotation(prev => ({ ...prev!, path: [...(prev!.path || []), point] }));
            }
        }
    };

    const handlePointerUp = () => {
        isPointerDown.current = false;
        if (drawingAnnotation) {
            if (drawingAnnotation.type === 'eraser' && (!drawingAnnotation.path || drawingAnnotation.path.length < 2)) {
                // Do not add dot erasures
            } else {
                setAnnotations(prev => [...prev, { ...drawingAnnotation, id: `ann-${Date.now()}` }]);
            }
            setDrawingAnnotation(null);
        }
        dragStartAnnotationPos.current = null;
    };
    
    const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (tool === 'text' && !editingAnnotation) {
            const rect = e.currentTarget.getBoundingClientRect();
            const point = getTransformedPoint(e.clientX - rect.left, e.clientY - rect.top);
            const fontSize = Math.max(16, image!.naturalWidth * 0.02);
            setEditingAnnotation({
                id: `ann-${Date.now()}`, type: 'text', color, text: '', fontSize,
                x: point.x, y: point.y, width: 200, height: fontSize * 1.2,
            });
            setSelectedAnnotationId(null);
        }
    };

    const handleDownload = (format: 'jpeg' | 'png') => {
        if (!image) return;
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = image.naturalWidth;
        tempCanvas.height = image.naturalHeight;
        const ctx = tempCanvas.getContext('2d')!;
        
        ctx.drawImage(imageRef.current, 0, 0);
        annotations.forEach(ann => {
            ctx.strokeStyle = ann.color;
            ctx.fillStyle = ann.color;
            ctx.lineWidth = 4;
            switch(ann.type) { 
                case 'rect': ctx.strokeRect(ann.x, ann.y, ann.width, ann.height); break;
                case 'arrow':
                    const headlen = 15;
                    const dx = ann.x + ann.width - ann.x;
                    const dy = ann.y + ann.height - ann.y;
                    const angle = Math.atan2(dy, dx);
                    ctx.beginPath(); ctx.moveTo(ann.x, ann.y); ctx.lineTo(ann.x + ann.width, ann.y + ann.height);
                    ctx.lineTo(ann.x + ann.width - headlen * Math.cos(angle - Math.PI / 6), ann.y + ann.height - headlen * Math.sin(angle - Math.PI / 6));
                    ctx.moveTo(ann.x + ann.width, ann.y + ann.height);
                    ctx.lineTo(ann.x + ann.width - headlen * Math.cos(angle + Math.PI / 6), ann.y + ann.height - headlen * Math.sin(angle + Math.PI / 6));
                    ctx.stroke(); break;
                case 'text':
                    ctx.font = `${ann.fontSize}px sans-serif`;
                    ctx.textBaseline = 'top';
                    wrapText(ctx, ann.text || '', ann.x, ann.y, ann.width, ann.fontSize! * 1.2);
                    break;
                case 'eraser':
                    ctx.globalCompositeOperation = 'destination-out';
                    ctx.strokeStyle = 'rgba(0,0,0,1)';
                    ctx.lineWidth = ann.strokeWidth!;
                    ctx.lineCap = 'round';
                    ctx.lineJoin = 'round';
                    if (ann.path && ann.path.length > 1) {
                        ctx.beginPath();
                        ctx.moveTo(ann.path[0].x, ann.path[0].y);
                        for (let i = 1; i < ann.path.length; i++) {
                            ctx.lineTo(ann.path[i].x, ann.path[i].y);
                        }
                        ctx.stroke();
                    }
                    ctx.globalCompositeOperation = 'source-over';
                    break;
            }
        });
        const mimeType = `image/${format}`;
        const filename = `anotado_${image.file.name.replace(/\.[^/.]+$/, "")}.${format}`;
        tempCanvas.toBlob((blob) => { if (blob) saveAs(blob, filename); }, mimeType, 0.9);
    };

    const ToolButton = ({ self, title, label, children }: { self: Tool; title: string; label: string; children: React.ReactNode; }) => (
        <button onClick={() => setTool(self)} title={title}
            className={`flex flex-col items-center justify-center gap-1 p-1 text-xs font-semibold rounded h-16 w-full transition-colors ${tool === self ? 'bg-indigo-600 text-white' : 'bg-slate-600 text-slate-300 hover:bg-slate-500'}`}>
            {children}
            <span className="text-center leading-tight">{label}</span>
        </button>
    );

    const getCursor = () => {
        if (editingAnnotation) return 'default';
        if (tool === 'eraser') return 'none'; // Custom cursor will be rendered
        switch (tool) {
            case 'zoom': return 'ns-resize';
            case 'select': return 'move';
            case 'text': return 'text';
            case 'rect': case 'arrow': return 'crosshair';
            default: return 'default';
        }
    };

    const selectedAnnotation = annotations.find(a => a.id === selectedAnnotationId);
    let editButtonPosition: {left: string, top: string, transform: string} | null = null;
    if (selectedAnnotation) {
        const screenPoint = worldToScreen(selectedAnnotation.x + selectedAnnotation.width / 2, selectedAnnotation.y + selectedAnnotation.height);
        editButtonPosition = {
            left: `${screenPoint.x}px`,
            top: `${screenPoint.y + 5}px`,
            transform: 'translateX(-50%)'
        };
    }

    return (
        <div className="relative bg-slate-800/50 p-6 md:p-8 rounded-2xl shadow-xl w-full mx-auto animate-fade-in">
            {!image ? (
                <div onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }} onDragOver={(e) => e.preventDefault()} onDragLeave={() => setIsDragging(false)} onDrop={(e) => { e.preventDefault(); setIsDragging(false); processFile(e.dataTransfer.files?.[0] || null); }}>
                    <label htmlFor="image-annotate-upload" className="w-full cursor-pointer"><div className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors duration-300 ${isDragging ? 'border-indigo-500 bg-slate-800' : 'border-slate-600 hover:border-indigo-500'}`}>
                        <UploadIcon className="mx-auto" /><p className="mt-2 text-slate-300"><span className="font-semibold text-indigo-400">Clique para carregar</span> ou arraste uma imagem</p><p className="text-xs text-slate-500">Adicione caixas, setas e texto para destacar informações</p>
                    </div></label>
                    <input id="image-annotate-upload" type="file" accept="image/png, image/jpeg" className="hidden" onChange={(e) => processFile(e.target.files?.[0] || null)} />
                </div>
            ) : (
                <div className="flex flex-col lg:flex-row gap-8">
                    <div className="flex-grow lg:w-2/3 bg-slate-900/50 rounded-lg flex items-center justify-center relative min-h-[40vh] touch-none overflow-hidden">
                        <canvas ref={canvasRef}
                            style={{ cursor: getCursor() }}
                            onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp}
                            onClick={handleCanvasClick}
                        />
                         {editingAnnotation && <TextEditor key={editingAnnotation.id} annotation={editingAnnotation} onAnnotationChange={setEditingAnnotation} onFinish={finishEditingText} worldToScreen={worldToScreen} zoom={zoom} />}
                         {selectedAnnotation && selectedAnnotation.type === 'text' && !editingAnnotation && editButtonPosition && (
                            <button
                                onClick={() => {
                                    setEditingAnnotation(selectedAnnotation);
                                    setSelectedAnnotationId(null);
                                }}
                                style={{
                                    position: 'absolute',
                                    ...editButtonPosition
                                }}
                                className="bg-indigo-600 text-white text-xs font-bold py-1 px-3 rounded-md shadow-lg z-20 hover:bg-indigo-500 transition-colors"
                            >
                                Editar Texto
                            </button>
                        )}
                    </div>
                    <div className="flex-shrink-0 lg:w-1/3 space-y-6">
                        <div className="p-4 bg-slate-700/50 rounded-lg space-y-4">
                            <h4 className="font-semibold text-slate-200">Ferramentas de Anotação</h4>
                            <div className="grid grid-cols-3 gap-2">
                                <ToolButton self="select" title="Mover / Selecionar (Delete para apagar)" label="Selecionar"><MoveIcon className="w-5 h-5"/></ToolButton>
                                <ToolButton self="rect" title="Desenhar Retângulo" label="Retângulo"><RectangleIcon className="w-5 h-5" /></ToolButton>
                                <ToolButton self="arrow" title="Desenhar Seta" label="Seta"><ArrowUpRightIcon className="w-5 h-5" /></ToolButton>
                                <ToolButton self="text" title="Adicionar Texto" label="Texto"><TypeIcon className="w-5 h-5" /></ToolButton>
                                <ToolButton self="eraser" title="Borracha" label="Borracha"><EraserIcon className="w-5 h-5" /></ToolButton>
                                <ToolButton self="zoom" title="Zoom (arraste verticalmente)" label="Zoom"><ZoomInIcon className="w-5 h-5"/></ToolButton>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-400 mb-2">Cor da Anotação</label>
                                <div className="flex flex-wrap justify-center gap-2">{MARKUP_COLORS.map(c => (
                                    <button key={c} onClick={() => setColor(c)} className={`w-8 h-8 rounded-full border-2 transition-all ${color === c ? 'border-white scale-110' : 'border-transparent'}`} style={{ backgroundColor: c }} />
                                ))}</div>
                            </div>
                            {tool === 'eraser' && (
                                <div>
                                    <label htmlFor="eraser-size" className="block text-sm font-medium text-slate-400 mb-2">Tamanho da Borracha: {eraserSize}px</label>
                                    <input type="range" id="eraser-size" min="2" max="100" value={eraserSize} onChange={e => setEraserSize(Number(e.target.value))} className="w-full h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer" />
                                </div>
                            )}
                        </div>
                        <div className="p-4 bg-slate-700/50 rounded-lg space-y-3">
                            <h4 className="font-semibold text-slate-200">Exportar Imagem</h4>
                            <button onClick={() => handleDownload('jpeg')} className="w-full p-3 bg-sky-600 text-sm font-semibold rounded hover:bg-sky-500 flex items-center justify-center gap-2"><DownloadIcon className="w-4 h-4" /> Baixar como JPG</button>
                            <button onClick={() => handleDownload('png')} className="w-full p-3 bg-teal-600 text-sm font-semibold rounded hover:bg-teal-500 flex items-center justify-center gap-2"><DownloadIcon className="w-4 h-4" /> Baixar como PNG</button>
                        </div>
                        <button onClick={() => processFile(null)} className="w-full p-3 bg-slate-600 text-sm font-semibold rounded hover:bg-slate-500">Carregar outra imagem</button>
                    </div>
                </div>
            )}
            {error && <p className="text-red-400 mt-4 text-center">{error}</p>}
        </div>
    );
};


const TextEditor = ({ annotation, onAnnotationChange, onFinish, worldToScreen, zoom }: {
    annotation: Annotation,
    onAnnotationChange: (ann: Annotation) => void,
    onFinish: () => void,
    worldToScreen: (x: number, y: number) => {x: number, y: number},
    zoom: number
}) => {
    const { x, y, text, fontSize, color, width } = annotation;
    const screenPoint = worldToScreen(x, y);
    const editorRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [isResizing, setIsResizing] = useState(false);
    const resizeStart = useRef({x: 0, width: 0});
    
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.focus();
            if(!text) textareaRef.current.select(); // Select default text
        }
    }, []);

    // Auto-resize textarea height
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    }, [text, width, zoom, fontSize]);

    const handleFontSizeChange = (delta: number) => {
        onAnnotationChange({ ...annotation, fontSize: Math.max(8, (fontSize || 16) + delta) });
    };
    
    const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        onAnnotationChange({ ...annotation, text: e.target.value });
    };

    const handleResizeMouseDown = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsResizing(true);
        resizeStart.current = { x: e.clientX, width: width };
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing) return;
            const deltaX = e.clientX - resizeStart.current.x;
            const newWidth = Math.max(50, resizeStart.current.width + (deltaX / zoom));
            onAnnotationChange({...annotation, width: newWidth});
        };
        const handleMouseUp = () => setIsResizing(false);

        if(isResizing) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizing, onAnnotationChange, annotation, zoom]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (editorRef.current && !editorRef.current.contains(event.target as Node)) {
                onFinish();
            }
        };
        setTimeout(() => document.addEventListener('mousedown', handleClickOutside), 0);
        return () => { document.removeEventListener('mousedown', handleClickOutside); };
    }, [onFinish]);

    return (
        <div 
            ref={editorRef}
            style={{ 
                position: 'absolute', 
                left: `${screenPoint.x}px`, 
                top: `${screenPoint.y}px`,
                width: `${width * zoom}px`,
            }}
            className="z-30 flex flex-col items-start"
            onPointerDown={(e) => e.stopPropagation()}
        >
            <div className="flex flex-wrap items-center gap-1 bg-slate-800 p-1 rounded-t-md shadow-lg">
                <button onClick={() => handleFontSizeChange(-2)} className="w-6 h-6 bg-slate-600 rounded text-white font-bold flex items-center justify-center hover:bg-slate-500">-</button>
                <span className="text-xs px-2 text-slate-300 w-8 text-center">{fontSize}pt</span>
                <button onClick={() => handleFontSizeChange(2)} className="w-6 h-6 bg-slate-600 rounded text-white font-bold flex items-center justify-center hover:bg-slate-500">+</button>
                <div className="h-6 w-[1px] bg-slate-700 mx-1"></div>
                {MARKUP_COLORS.map(c => (
                    <button
                        key={c}
                        onClick={() => onAnnotationChange({ ...annotation, color: c })}
                        className={`w-5 h-5 rounded-full border-2 transition-all ${color === c ? 'border-white' : 'border-slate-400'}`}
                        style={{ backgroundColor: c }}
                    />
                 ))}
            </div>
            <div className="relative w-full">
                <textarea
                    ref={textareaRef}
                    value={text}
                    placeholder="Digite aqui..."
                    onChange={handleTextChange}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onFinish(); } }}
                    className="bg-slate-800/80 border-2 border-dashed border-indigo-500 text-white p-1 resize-none focus:outline-none w-full"
                    style={{
                        color: color,
                        fontSize: `${fontSize! * zoom}px`,
                        lineHeight: 1.2,
                    }}
                />
                <div 
                    onMouseDown={handleResizeMouseDown}
                    className="absolute bottom-0 right-0 w-4 h-4 bg-indigo-500 cursor-nwse-resize rounded-tl-lg"
                    style={{transform: 'translate(2px, 2px)'}}
                />
            </div>
        </div>
    );
};


export default ImageAnnotator;
