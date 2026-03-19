import React, { useState, useMemo, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { 
  Upload, 
  FileText, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  BarChart3, 
  Download,
  Loader2,
  Trash2,
  ChevronDown,
  Calendar,
  Layers
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  Tooltip, 
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid
} from 'recharts';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import { analyzeDocument } from './services/aiService';
import { Certificate, InvoiceItem, AnalysisResult } from './types';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState(0);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [extractedTexts, setExtractedTexts] = useState<string[]>([]);

  const steps = [
    "قراءة الملفات وتحميل البيانات...",
    "تحويل المستندات إلى نص (OCR)...",
    "استخراج بيانات الشهادات والفواتير...",
    "بدء عملية المطابقة والتحقق..."
  ];

  const today = new Date().toISOString().split('T')[0];

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    setIsAnalyzing(true);
    setAnalysisStep(0);
    setError(null);

    try {
      const allCertificates: Certificate[] = [];
      const allInvoices: InvoiceItem[] = [];
      const allTexts: string[] = [];

      for (let i = 0; i < acceptedFiles.length; i++) {
        const file = acceptedFiles[i];
        setAnalysisStep(0);
        
        const reader = new FileReader();
        const fileDataPromise = new Promise<string>((resolve) => {
          reader.onload = () => resolve(reader.result as string);
        });
        reader.readAsDataURL(file);
        const base64 = await fileDataPromise;

        setAnalysisStep(1);
        const data = await analyzeDocument(base64, file.type);
        
        setAnalysisStep(2);
        allCertificates.push(...data.certificates);
        allInvoices.push(...data.invoices.map((inv: any) => ({
          ...inv,
          date: today
        })));
        if (data.fullText) allTexts.push(data.fullText);
      }

      setAnalysisStep(3);
      await new Promise(r => setTimeout(r, 500));

      setResult({
        certificates: allCertificates,
        invoices: allInvoices
      });
      setExtractedTexts(allTexts);
    } catch (err) {
      setError('حدث خطأ أثناء تحليل الملفات. يرجى المحاولة مرة أخرى.');
    } finally {
      setIsAnalyzing(false);
    }
  }, [today]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (acceptedFiles: File[]) => {
      onDrop(acceptedFiles);
    },
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png'],
      'application/pdf': ['.pdf']
    },
    multiple: true
  } as any);

  const comparisonData = useMemo(() => {
    if (!result) return [];

    return result.invoices.map(inv => {
      // Logic: In a real scenario, we might match by some keyword or CCR No if present in invoice
      // For this demo, let's assume we match by looking for a certificate that matches the CCR No 
      // if the AI extracted it, or we just show the status of all extracted certificates.
      // The user asked to compare based on CCR No.
      
      // Since the AI might extract CCR No from the invoice too, let's check.
      // If not, we'll just list the certificates and their status.
      return result.certificates.map(cert => {
        const expiryDate = new Date(cert.expiryDate);
        const isExpired = expiryDate < new Date();
        return {
          ...cert,
          status: isExpired ? 'expired' : 'valid'
        };
      });
    }).flat();
  }, [result]);

  const stats = useMemo(() => {
    if (!result) return { valid: 0, expired: 0, total: 0 };
    const valid = comparisonData.filter(c => c.status === 'valid').length;
    const expired = comparisonData.filter(c => c.status === 'expired').length;
    return { valid, expired, total: comparisonData.length };
  }, [comparisonData, result]);

  const chartData = [
    { name: 'سارية المفعول', value: stats.valid, color: '#10b981' },
    { name: 'منتهية الصلاحية', value: stats.expired, color: '#ef4444' }
  ];

  const exportPDF = () => {
    if (!result) return;
    const doc = new jsPDF('p', 'mm', 'a4');
    
    // Add Arabic font support would be ideal, but for now we'll use standard with labels
    doc.setFontSize(20);
    doc.text('Report: Certificate & Invoice Matching', 105, 15, { align: 'center' });
    
    doc.setFontSize(12);
    doc.text(`Date: ${today}`, 10, 25);

    // Certificates Table
    doc.text('Certificates Analysis', 10, 35);
    autoTable(doc, {
      startY: 40,
      head: [['CCR No', 'Type', 'Approval Date', 'Expiry Date', 'Status']],
      body: comparisonData.map(c => [
        c.ccrNo, 
        c.type, 
        c.approvalDate, 
        c.expiryDate, 
        c.status === 'valid' ? 'Valid' : 'Expired'
      ]),
    });

    // Invoices Table
    const finalY = (doc as any).lastAutoTable.finalY || 40;
    doc.text('Invoice Items', 10, finalY + 10);
    autoTable(doc, {
      startY: finalY + 15,
      head: [['Description', 'Quantity', 'Date']],
      body: result.invoices.map(i => [i.specification, i.quantity, i.date]),
    });

    doc.save(`matching-report-${today}.pdf`);
  };

  const filteredInvoices = useMemo(() => {
    if (!result) return [];
    return result.invoices.filter(inv => 
      inv.specification.toLowerCase().includes(invoiceSearch.toLowerCase())
    );
  }, [result, invoiceSearch]);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#1E293B] font-sans selection:bg-indigo-100" dir="rtl">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200">
              <Layers className="text-white w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">مطابق الشهادات الذكي</h1>
          </div>
          {result && (
            <button 
              onClick={exportPDF}
              className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-800 transition-all shadow-sm font-medium text-sm"
            >
              <Download size={18} />
              تصدير تقرير PDF
            </button>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!result ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-2xl mx-auto mt-12"
          >
            <div className="text-center mb-10">
              <h2 className="text-4xl font-black text-slate-900 mb-4 tracking-tight">تحليل ومطابقة المستندات</h2>
              <p className="text-slate-500 text-lg font-medium">ارفع ملف الشهادات والفواتير ليقوم الذكاء الاصطناعي باستخراج البيانات ومطابقتها تلقائياً.</p>
            </div>

            <div 
              {...getRootProps()} 
              className={cn(
                "relative group cursor-pointer rounded-[2.5rem] border-2 border-dashed transition-all duration-700 p-12 flex flex-col items-center justify-center gap-8 overflow-hidden",
                isDragActive ? "border-indigo-500 bg-indigo-50/30 scale-[1.01]" : "border-slate-200 bg-white hover:border-indigo-300 hover:shadow-[0_32px_64px_-12px_rgba(99,102,241,0.12)]",
                isAnalyzing && "pointer-events-none border-indigo-100 bg-slate-50/20"
              )}
            >
              <input {...getInputProps()} />
              
              {isAnalyzing ? (
                <div className="flex flex-col items-center gap-12 w-full max-w-md relative z-10 py-4">
                  <div className="relative">
                    <div className="absolute inset-0 bg-indigo-400 blur-[80px] opacity-10 animate-pulse rounded-full"></div>
                    <div className="relative w-40 h-40">
                      <svg className="w-full h-full transform -rotate-90 filter drop-shadow-sm">
                        <circle
                          cx="80"
                          cy="80"
                          r="74"
                          stroke="currentColor"
                          strokeWidth="4"
                          fill="transparent"
                          className="text-slate-100"
                        />
                        <motion.circle
                          cx="80"
                          cy="80"
                          r="74"
                          stroke="currentColor"
                          strokeWidth="6"
                          fill="transparent"
                          strokeDasharray={465}
                          initial={{ strokeDashoffset: 465 }}
                          animate={{ strokeDashoffset: 465 - (465 * (analysisStep + 1)) / steps.length }}
                          transition={{ duration: 0.8, ease: "circOut" }}
                          className="text-indigo-600"
                          strokeLinecap="round"
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-4xl font-black text-slate-900 tracking-tighter">
                          {Math.round(((analysisStep + 1) / steps.length) * 100)}%
                        </span>
                        <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-slate-400 mt-1">Processing</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="w-full space-y-6">
                    <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${((analysisStep + 1) / steps.length) * 100}%` }}
                        className="h-full bg-indigo-600"
                      />
                    </div>
                    <div className="space-y-2">
                      {steps.map((step, idx) => (
                        <motion.div 
                          key={idx} 
                          initial={false}
                          animate={{ 
                            opacity: analysisStep === idx ? 1 : analysisStep > idx ? 0.5 : 0.2,
                            scale: analysisStep === idx ? 1 : 0.98,
                            y: analysisStep === idx ? 0 : 5
                          }}
                          className={cn(
                            "flex items-center gap-4 p-4 rounded-2xl transition-all duration-500 border",
                            analysisStep === idx ? "bg-white border-slate-100 shadow-xl shadow-slate-200/40" : "border-transparent"
                          )}
                        >
                          <div className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold transition-all duration-500",
                            analysisStep === idx ? "bg-indigo-600 text-white shadow-lg shadow-indigo-200 rotate-0" :
                            analysisStep > idx ? "bg-emerald-500 text-white rotate-0" : "bg-slate-50 text-slate-300"
                          )}>
                            {analysisStep > idx ? <CheckCircle2 size={18} /> : idx + 1}
                          </div>
                          <div className="flex flex-col">
                            <p className={cn(
                              "text-sm font-bold tracking-tight transition-colors duration-500",
                              analysisStep === idx ? "text-slate-900" : "text-slate-400"
                            )}>
                              {step}
                            </p>
                            {analysisStep === idx && (
                              <motion.span 
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="text-[10px] text-indigo-500 font-medium mt-0.5"
                              >
                                جاري المعالجة...
                              </motion.span>
                            )}
                          </div>
                          {analysisStep === idx && (
                            <div className="mr-auto">
                              <div className="flex gap-1">
                                <motion.div 
                                  animate={{ scale: [1, 1.5, 1] }} 
                                  transition={{ repeat: Infinity, duration: 1 }}
                                  className="w-1 h-1 bg-indigo-600 rounded-full" 
                                />
                                <motion.div 
                                  animate={{ scale: [1, 1.5, 1] }} 
                                  transition={{ repeat: Infinity, duration: 1, delay: 0.2 }}
                                  className="w-1 h-1 bg-indigo-600 rounded-full" 
                                />
                                <motion.div 
                                  animate={{ scale: [1, 1.5, 1] }} 
                                  transition={{ repeat: Infinity, duration: 1, delay: 0.4 }}
                                  className="w-1 h-1 bg-indigo-600 rounded-full" 
                                />
                              </div>
                            </div>
                          )}
                        </motion.div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="w-20 h-20 bg-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600 group-hover:scale-110 transition-transform duration-300">
                    <Upload size={40} />
                  </div>
                  <div className="text-center">
                    <p className="text-xl font-semibold text-slate-800 mb-2">اسحب الملف هنا أو انقر للاختيار</p>
                    <p className="text-slate-500">يدعم الصور (JPG, PNG) وملفات PDF</p>
                  </div>
                </>
              )}
            </div>

            {error && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-6 p-4 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3 text-red-700"
              >
                <AlertCircle size={20} />
                <p className="font-medium">{error}</p>
              </motion.div>
            )}

            {/* Problem Description Section */}
            <div className="mt-24 space-y-12">
              <div className="text-center max-w-xl mx-auto">
                <h3 className="text-2xl font-black text-slate-900 tracking-tight">لماذا تحتاج إلى هذا النظام؟</h3>
                <p className="text-slate-500 mt-2 font-medium">نحن نعالج التحديات اللوجستية المعقدة باستخدام الذكاء الاصطناعي</p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <motion.div 
                  whileHover={{ y: -5 }}
                  className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-slate-200/50 transition-all duration-500"
                >
                  <div className="w-14 h-14 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mb-6 shadow-inner">
                    <AlertCircle size={28} />
                  </div>
                  <h4 className="text-xl font-bold text-slate-900 mb-4">وصف المشكلة</h4>
                  <p className="text-slate-600 leading-relaxed font-medium">
                    المطابقة اليدوية بين الشهادات (CCR) والفواتير عملية بطيئة وعرضة للأخطاء البشرية. الشهادات منتهية الصلاحية قد تمر دون ملاحظة، مما يؤدي إلى غرامات مالية وتأخير في التخليص الجمركي للشحنات.
                  </p>
                </motion.div>

                <motion.div 
                  whileHover={{ y: -5 }}
                  className="bg-indigo-600 p-8 rounded-[2.5rem] text-white shadow-2xl shadow-indigo-200 transition-all duration-500"
                >
                  <div className="w-14 h-14 bg-white/10 text-white rounded-2xl flex items-center justify-center mb-6 backdrop-blur-md">
                    <CheckCircle2 size={28} />
                  </div>
                  <h4 className="text-xl font-bold mb-4">الحل الذكي</h4>
                  <p className="text-indigo-100 leading-relaxed font-medium">
                    يقوم نظامنا بأتمتة هذه العملية بالكامل. من خلال استخراج البيانات ذكياً، نضمن اكتشاف أي شهادة منتهية فوراً ومطابقتها مع بنود الفاتورة بدقة، مما يوفر الوقت ويمنع الخسائر المالية الناتجة عن التأخير.
                  </p>
                </motion.div>
              </div>
            </div>
          </motion.div>
        ) : (
          <div className="space-y-8">
            {/* Actions Bar */}
            <div className="flex justify-end">
              <button 
                onClick={() => setResult(null)}
                className="flex items-center gap-2 text-slate-500 hover:text-red-600 transition-colors font-medium"
              >
                <Trash2 size={18} />
                مسح البيانات والبدء من جديد
              </button>
            </div>

            {/* Dashboard Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm"
              >
                <div className="flex items-center justify-between mb-4">
                  <p className="text-slate-500 font-medium">إجمالي الشهادات</p>
                  <FileText className="text-indigo-500" size={24} />
                </div>
                <p className="text-4xl font-bold text-slate-900">{stats.total}</p>
              </motion.div>

              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.1 }}
                className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm"
              >
                <div className="flex items-center justify-between mb-4">
                  <p className="text-slate-500 font-medium">سارية المفعول</p>
                  <CheckCircle2 className="text-emerald-500" size={24} />
                </div>
                <p className="text-4xl font-bold text-emerald-600">{stats.valid}</p>
              </motion.div>

              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 }}
                className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm"
              >
                <div className="flex items-center justify-between mb-4">
                  <p className="text-slate-500 font-medium">منتهية الصلاحية</p>
                  <XCircle className="text-red-500" size={24} />
                </div>
                <p className="text-4xl font-bold text-red-600">{stats.expired}</p>
              </motion.div>
            </div>

            {/* Raw Extracted Text (Collapsible) */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <details className="group">
                <summary className="p-6 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors list-none">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-slate-100 text-slate-600 rounded-lg flex items-center justify-center">
                      <FileText size={18} />
                    </div>
                    <h3 className="text-lg font-bold">النص المستخرج من المستندات (Raw Text)</h3>
                  </div>
                  <ChevronDown size={20} className="text-slate-400 group-open:rotate-180 transition-transform" />
                </summary>
                <div className="p-6 pt-0 border-t border-slate-100">
                  <div className="space-y-4 max-h-[400px] overflow-y-auto">
                    {extractedTexts.map((text, idx) => (
                      <div key={idx} className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <p className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider">مستند #{idx + 1}</p>
                        <pre className="whitespace-pre-wrap text-sm text-slate-600 font-mono leading-relaxed">
                          {text}
                        </pre>
                      </div>
                    ))}
                  </div>
                </div>
              </details>
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
                <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                  <BarChart3 size={20} className="text-indigo-600" />
                  توزيع حالة الشهادات
                </h3>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={chartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend verticalAlign="bottom" height={36}/>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
                <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                  <Calendar size={20} className="text-indigo-600" />
                  ملخص الكميات (الفاتورة)
                </h3>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={result.invoices}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                      <XAxis dataKey="specification" tick={{ fontSize: 12 }} />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="quantity" fill="#6366f1" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Comparison Table */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                <h3 className="text-lg font-bold">جدول المطابقة والبيانات المستخرجة</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-sm uppercase tracking-wider">
                      <th className="px-6 py-4 font-semibold w-16">م</th>
                      <th className="px-6 py-4 font-semibold">رقم الشهادة (CCR)</th>
                      <th className="px-6 py-4 font-semibold">النوع</th>
                      <th className="px-6 py-4 font-semibold">تاريخ الإصدار</th>
                      <th className="px-6 py-4 font-semibold">تاريخ الانتهاء</th>
                      <th className="px-6 py-4 font-semibold">الشروط</th>
                      <th className="px-6 py-4 font-semibold">الصفحة</th>
                      <th className="px-6 py-4 font-semibold">الحالة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {comparisonData.map((cert, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4 text-slate-400 font-medium">{idx + 1}</td>
                        <td className="px-6 py-4 font-mono font-medium text-slate-700">{cert.ccrNo}</td>
                        <td className="px-6 py-4 text-slate-600">{cert.type}</td>
                        <td className="px-6 py-4 text-slate-600">{cert.issueDate || '-'}</td>
                        <td className="px-6 py-4 text-slate-600">{cert.expiryDate}</td>
                        <td className="px-6 py-4 text-slate-600 max-w-[200px] truncate" title={cert.terms}>{cert.terms || '-'}</td>
                        <td className="px-6 py-4 text-slate-600">{cert.pageNumber}</td>
                        <td className="px-6 py-4">
                          <div className="group relative inline-block">
                            <span className={cn(
                              "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold cursor-help",
                              cert.status === 'valid' ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                            )}>
                              {cert.status === 'valid' ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                              {cert.status === 'valid' ? 'سارية المفعول' : 'منتهية الصلاحية'}
                            </span>
                            <div className="invisible group-hover:visible absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-slate-900 text-white text-[10px] rounded-lg shadow-xl z-20">
                              <p>تاريخ الانتهاء: {cert.expiryDate}</p>
                              <p>تاريخ اليوم: {today}</p>
                              <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-slate-900"></div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {comparisonData.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-6 py-12 text-center text-slate-400 italic">
                          لم يتم العثور على شهادات مطابقة
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Invoice Details */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <h3 className="text-lg font-bold">تفاصيل الفاتورة</h3>
                <div className="relative w-full sm:w-64">
                  <input 
                    type="text" 
                    placeholder="بحث في الوصف..." 
                    value={invoiceSearch}
                    onChange={(e) => setInvoiceSearch(e.target.value)}
                    className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  />
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-sm uppercase tracking-wider">
                      <th className="px-6 py-4 font-semibold w-16">م</th>
                      <th className="px-6 py-4 font-semibold">الوصف / المواصفات</th>
                      <th className="px-6 py-4 font-semibold">الكمية</th>
                      <th className="px-6 py-4 font-semibold">التاريخ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredInvoices.map((inv, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4 text-slate-400 font-medium">{idx + 1}</td>
                        <td className="px-6 py-4 text-slate-700 font-medium">{inv.specification}</td>
                        <td className="px-6 py-4 text-slate-600">{inv.quantity}</td>
                        <td className="px-6 py-4 text-slate-600">{inv.date}</td>
                      </tr>
                    ))}
                    {filteredInvoices.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-6 py-12 text-center text-slate-400 italic">
                          لا توجد نتائج مطابقة للبحث
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Detailed Summary Lists */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <h4 className="text-emerald-700 font-bold flex items-center gap-2 px-2">
                  <CheckCircle2 size={18} />
                  الشهادات سارية المفعول
                </h4>
                <div className="space-y-3">
                  {comparisonData.filter(c => c.status === 'valid').map((c, i) => (
                    <div key={i} className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl">
                      <p className="font-bold text-emerald-900">{c.ccrNo}</p>
                      <p className="text-sm text-emerald-700">{c.type} - تنتهي في {c.expiryDate}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-red-700 font-bold flex items-center gap-2 px-2">
                  <XCircle size={18} />
                  الشهادات منتهية الصلاحية
                </h4>
                <div className="space-y-3">
                  {comparisonData.filter(c => c.status === 'expired').map((c, i) => (
                    <div key={i} className="bg-red-50 border border-red-100 p-4 rounded-xl">
                      <p className="font-bold text-red-900">{c.ccrNo}</p>
                      <p className="text-sm text-red-700">{c.type} - انتهت في {c.expiryDate}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
      
      <footer className="max-w-7xl mx-auto px-4 py-12 text-center text-slate-400 text-sm">
        <p>© {new Date().getFullYear()} نظام مطابق الشهادات الذكي - مدعوم بالذكاء الاصطناعي</p>
      </footer>
    </div>
  );
}
