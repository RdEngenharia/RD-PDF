
import React, { useState, useCallback } from 'react';
import { PDFDocument } from 'pdf-lib';
import { saveAs } from 'file-saver';
import { UploadIcon, SpinnerIcon, DownloadIcon, FileIcon } from './Icons';

const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

const PdfCompressor: React.FC = () => {
    const [pdfFile, setPdfFile] = useState<File | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [compressionResult, setCompressionResult] = useState<{ originalSize: number; compressedSize: number; } | null>(null);
    const [isDragging, setIsDragging] = useState(false);

    const processFile = (file: File | null) => {
        if (file) {
            if (file.type === 'application/pdf') {
                setPdfFile(file);
                setError(null);
                setCompressionResult(null);
            } else {
                setError('Por favor, selecione um arquivo PDF.');
                setPdfFile(null);
                setCompressionResult(null);
            }
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        processFile(e.target.files?.[0] || null);
    };
    
    const handleDragEvents = (e: React.DragEvent<HTMLDivElement>, action: 'enter' | 'leave' | 'over' | 'drop') => {
        e.preventDefault();
        e.stopPropagation();
        if (action === 'enter' || action === 'over') {
          setIsDragging(true);
        } else if (action === 'leave' || action === 'drop') {
          setIsDragging(false);
          if (action === 'drop') {
            processFile(e.dataTransfer.files?.[0] || null);
          }
        }
    };

    const compressPdf = useCallback(async () => {
        if (!pdfFile) {
            setError('Por favor, selecione um arquivo PDF primeiro.');
            return;
        }
        setError(null);
        setIsLoading(true);
        setCompressionResult(null);

        try {
            const arrayBuffer = await pdfFile.arrayBuffer();
            const pdfDoc = await PDFDocument.load(arrayBuffer);
            
            // This is a placeholder for actual compression logic which is complex.
            // For now, pdf-lib's save method does some optimization.
            const compressedPdfBytes = await pdfDoc.save();

            const originalSize = pdfFile.size;
            const compressedSize = compressedPdfBytes.length;

            if (compressedSize >= originalSize) {
                setError('O PDF já está otimizado. A compressão não reduziu o tamanho.');
            } else {
                setCompressionResult({ originalSize, compressedSize });
            }

            const blob = new Blob([compressedPdfBytes as any], { type: 'application/pdf' });
            saveAs(blob, `rd-pdf-comprimido.pdf`);

        } catch (e) {
            console.error(e);
            setError('Ocorreu um erro durante a compressão. O PDF pode estar corrompido ou protegido.');
        } finally {
            setIsLoading(false);
        }
    }, [pdfFile]);

    return (
        <div 
            className="relative bg-slate-800/50 p-6 md:p-8 rounded-2xl shadow-xl w-full mx-auto animate-fade-in"
            onDragEnter={(e) => handleDragEvents(e, 'enter')}
            onDragLeave={(e) => handleDragEvents(e, 'leave')}
            onDragOver={(e) => handleDragEvents(e, 'over')}
            onDrop={(e) => handleDragEvents(e, 'drop')}
        >
             {isDragging && (
                <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center rounded-2xl z-20 pointer-events-none">
                    <div className="text-center">
                        <UploadIcon className="mx-auto w-16 h-16 text-indigo-400" />
                        <p className="mt-4 text-lg font-semibold text-slate-200">Solte o PDF aqui</p>
                    </div>
                </div>
            )}
            <div className="flex flex-col items-center">
                <label htmlFor="pdf-compress-upload" className="w-full cursor-pointer">
                    <div className="border-2 border-dashed border-slate-600 rounded-lg p-8 text-center hover:border-indigo-500 hover:bg-slate-800 transition-colors duration-300 min-h-[170px] flex justify-center items-center">
                        {pdfFile ? (
                           <div className="flex flex-col items-center gap-2 text-slate-300">
                             <FileIcon />
                             <span className="text-sm font-mono truncate max-w-full px-4">{pdfFile.name}</span>
                             <span className="text-xs text-slate-500 font-mono">{formatBytes(pdfFile.size)}</span>
                           </div>
                        ) : (
                            <div>
                                <UploadIcon className="mx-auto" />
                                <p className="mt-2 text-slate-300">
                                  <span className="font-semibold text-indigo-400">Clique para carregar</span> ou arraste e solte um PDF
                                </p>
                                <p className="text-xs text-slate-500">Compressão otimizada sem perda de qualidade</p>
                            </div>
                        )}
                    </div>
                </label>
                <input id="pdf-compress-upload" type="file" accept="application/pdf" className="hidden" onChange={handleFileChange} />
                
                {compressionResult && (
                    <div className="mt-6 text-center bg-slate-700/50 p-4 rounded-lg w-full max-w-sm">
                        <h4 className="font-semibold text-slate-200">Compressão Concluída!</h4>
                        <p className="text-sm text-slate-400 mt-2">
                            Tamanho Original: <span className="font-mono text-slate-200">{formatBytes(compressionResult.originalSize)}</span>
                        </p>
                        <p className="text-sm text-slate-400">
                            Tamanho Comprimido: <span className="font-mono text-green-400">{formatBytes(compressionResult.compressedSize)}</span>
                        </p>
                        <p className="text-lg font-bold text-indigo-400 mt-2">
                            Redução de {(((compressionResult.originalSize - compressionResult.compressedSize) / compressionResult.originalSize) * 100).toFixed(1)}%
                        </p>
                    </div>
                )}

                {error && <p className="text-red-400 mt-4 text-sm">{error}</p>}

                 <button
                    onClick={compressPdf}
                    disabled={isLoading || !pdfFile}
                    className="w-full md:w-auto mt-8 px-8 py-3 bg-indigo-600 text-white font-bold rounded-lg shadow-lg hover:bg-indigo-700 disabled:bg-slate-600 disabled:cursor-not-allowed transition-all duration-300 flex items-center justify-center gap-2"
                >
                    {isLoading ? (
                        <>
                            <SpinnerIcon />
                            Comprimindo...
                        </>
                    ) : (
                        <>
                            <DownloadIcon />
                            Comprimir e Baixar
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};

export default PdfCompressor;
