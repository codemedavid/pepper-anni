import React, { useState, useRef } from 'react';
import { ArrowLeft, Plus, Edit, Trash2, Save, X, Eye, EyeOff, Upload, FileText, Image, Settings, Package } from 'lucide-react';
import { useProtocols, Protocol, protocolAdmin } from '../hooks/useProtocols';
import { useMenu } from '../hooks/useMenu';
import { supabase } from '../lib/supabase';
import ProtocolSettings from './ProtocolSettings';

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

/** Uploads a file into the private `protocol-files` bucket through a server-issued signed upload URL. */
async function uploadProtocolFile(file: File): Promise<string> {
    if (file.size > MAX_FILE_SIZE_BYTES) {
        throw new Error(`File must be less than 25MB. Current size: ${(file.size / 1024 / 1024).toFixed(2)}MB`);
    }
    const { path, token } = await protocolAdmin<{ path: string; token: string }>('create_upload_url', {
        filename: file.name,
        content_type: file.type,
    });
    const { error } = await supabase.storage
        .from('protocol-files')
        .uploadToSignedUrl(path, token, file, file.type ? { contentType: file.type } : undefined);
    if (error) throw new Error(error.message || 'Upload failed');
    return path;
}

interface ProtocolManagerProps {
    onBack: () => void;
}

const ProtocolManager: React.FC<ProtocolManagerProps> = ({ onBack }) => {
    const { protocols, loading, addProtocol, updateProtocol, deleteProtocol, toggleActive, setAssignments } = useProtocols();
    const { products } = useMenu();
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [showSettings, setShowSettings] = useState(false);
    const [productIds, setProductIds] = useState<string[]>([]);
    const [productSearch, setProductSearch] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isAdding, setIsAdding] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const emptyForm = {
        name: '',
        category: '',
        dosage: '',
        frequency: '',
        duration: '',
        notes: [] as string[],
        storage: '',
        sort_order: 0,
        active: true,
        content_type: 'text' as 'text' | 'file' | 'image',
        file_url: null as string | null,
        file_path: null as string | null
    };

    const uploadImage = async (file: File): Promise<string> => {
        setUploading(true);
        setUploadProgress(10);
        try {
            const path = await uploadProtocolFile(file);
            setUploadProgress(100);
            return path;
        } finally {
            setUploading(false);
            setTimeout(() => setUploadProgress(0), 1000);
        }
    };

    const [formData, setFormData] = useState(emptyForm);
    const [notesText, setNotesText] = useState('');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [filePreview, setFilePreview] = useState<string | null>(null);

    const handleEdit = (protocol: Protocol) => {
        if (fileInputRef.current) fileInputRef.current.value = '';
        setEditingId(protocol.id);
        setFormData({
            name: protocol.name,
            category: protocol.category,
            dosage: protocol.dosage,
            frequency: protocol.frequency,
            duration: protocol.duration,
            notes: protocol.notes,
            storage: protocol.storage,
            sort_order: protocol.sort_order,
            active: protocol.active,
            content_type: protocol.content_type || 'text',
            file_url: protocol.file_url || null,
            file_path: protocol.file_path || null
        });
        setProductIds(protocol.product_ids ?? (protocol.product_id ? [protocol.product_id] : []));
        setProductSearch('');
        setNotesText(protocol.notes.join('\n'));
        setFilePreview(protocol.signed_url || protocol.file_url || null);
        setSelectedFile(null);
        setIsAdding(false);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleAdd = () => {
        if (fileInputRef.current) fileInputRef.current.value = '';
        setIsAdding(true);
        setEditingId(null);
        setFormData({ ...emptyForm, sort_order: protocols.length + 1 });
        setProductIds([]);
        setProductSearch('');
        setNotesText('');
        setSelectedFile(null);
        setFilePreview(null);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleCancel = () => {
        if (fileInputRef.current) fileInputRef.current.value = '';
        setEditingId(null);
        setIsAdding(false);
        setFormData(emptyForm);
        setProductIds([]);
        setProductSearch('');
        setNotesText('');
        setSelectedFile(null);
        setFilePreview(null);
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        // Reset the input so selecting the same file again still fires onChange
        e.target.value = '';
        if (!file) return;

        setSelectedFile(file);

        if (formData.content_type === 'image' && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (ev) => setFilePreview(ev.target?.result as string);
            reader.readAsDataURL(file);
        } else {
            setFilePreview(null);
        }
    };

    const handleSave = async () => {
        if (!formData.name || !formData.category) {
            alert('Please fill in name and category');
            return;
        }

        if (formData.content_type === 'text' && !formData.dosage) {
            alert('Please fill in dosage for text protocols');
            return;
        }

        if ((formData.content_type === 'file' || formData.content_type === 'image') && !selectedFile && !formData.file_url && !formData.file_path) {
            alert(`Please upload a ${formData.content_type === 'file' ? 'file' : 'image'}`);
            return;
        }

        setIsProcessing(true);
        const notes = notesText.split('\n').filter(note => note.trim() !== '');
        const dataToSave = { ...formData, notes };

        try {
            // Upload file if selected
            if (selectedFile && (formData.content_type === 'file' || formData.content_type === 'image')) {
                // Private bucket: store the object path; the server signs short-lived URLs on read.
                dataToSave.file_path = await uploadImage(selectedFile);
                dataToSave.file_url = null;
            }

            if (isAdding) {
                const result = await addProtocol(dataToSave);
                if (!result.success) throw new Error(result.error);
                if (productIds.length && result.data?.id) {
                    const assigned = await setAssignments(result.data.id, productIds);
                    if (!assigned.success) throw new Error(assigned.error);
                }
            } else if (editingId) {
                const result = await updateProtocol(editingId, dataToSave);
                if (!result.success) throw new Error(result.error);
                const before = protocols.find(p => p.id === editingId)?.product_ids ?? [];
                const changed = before.length !== productIds.length || before.some(id => !productIds.includes(id));
                if (changed) {
                    const assigned = await setAssignments(editingId, productIds);
                    if (!assigned.success) throw new Error(assigned.error);
                }
            }
            handleCancel();
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Failed to save');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this protocol?')) return;
        setIsProcessing(true);
        try {
            const result = await deleteProtocol(id);
            if (!result.success) throw new Error(result.error);
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Failed to delete');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleToggleActive = async (id: string, currentActive: boolean) => {
        setIsProcessing(true);
        try {
            const result = await toggleActive(id, !currentActive);
            if (!result.success) throw new Error(result.error);
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Failed to toggle');
        } finally {
            setIsProcessing(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white shadow-sm border-b border-gray-200">
                <div className="max-w-4xl mx-auto px-4 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={onBack}
                                className="text-gray-500 hover:text-gray-900 transition-colors"
                            >
                                <ArrowLeft className="w-5 h-5" />
                            </button>
                            <h1 className="text-xl font-bold text-gray-900">📋 Protocol Manager</h1>
                        </div>
                        {!isAdding && !editingId && (
                            <div className="flex items-center gap-2">
                            <button
                                onClick={() => setShowSettings(v => !v)}
                                className={`flex items-center gap-2 px-3 py-2 border rounded-lg transition-colors ${showSettings ? 'border-gray-900 bg-gray-100 text-gray-900' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                                aria-pressed={showSettings}
                            >
                                <Settings className="w-4 h-4" />
                                Settings
                            </button>
                            <button
                                onClick={handleAdd}
                                className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
                            >
                                <Plus className="w-4 h-4" />
                                Add Protocol
                            </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="max-w-4xl mx-auto px-4 py-6">
                {showSettings && !isAdding && !editingId && <ProtocolSettings />}

                {/* Add/Edit Form */}
                {(isAdding || editingId) && (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
                        <h2 className="text-lg font-bold text-gray-900 mb-4">
                            {isAdding ? '➕ Add New Protocol' : '✏️ Edit Protocol'}
                        </h2>

                        {/* Name, Category, Sort Order */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                                    placeholder="e.g., Tirzepatide"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
                                <input
                                    type="text"
                                    value={formData.category}
                                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                                    placeholder="e.g., Weight Management"
                                />
                            </div>
                        </div>

                        {/* Content Type Selector */}
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">Protocol Content Type *</label>
                            <div className="flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setFormData({ ...formData, content_type: 'text', file_url: null, file_path: null });
                                        setSelectedFile(null);
                                        setFilePreview(null);
                                    }}
                                    className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 transition-all ${formData.content_type === 'text' ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 text-gray-700 hover:border-gray-400'}`}
                                >
                                    <FileText className="w-4 h-4" />
                                    Text
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setFormData({ ...formData, content_type: 'file' });
                                        setSelectedFile(null);
                                        setFilePreview(null);
                                    }}
                                    className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 transition-all ${formData.content_type === 'file' ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 text-gray-700 hover:border-gray-400'}`}
                                >
                                    <Upload className="w-4 h-4" />
                                    File
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setFormData({ ...formData, content_type: 'image' });
                                        setSelectedFile(null);
                                        setFilePreview(null);
                                    }}
                                    className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 transition-all ${formData.content_type === 'image' ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 text-gray-700 hover:border-gray-400'}`}
                                >
                                    <Image className="w-4 h-4" />
                                    Image
                                </button>
                            </div>
                        </div>

                        {/* Text Content Fields (also shown for image protocols, so a guide can have both) */}
                        {(formData.content_type === 'text' || formData.content_type === 'image') && (
                            <>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Dosage *</label>
                                        <input
                                            type="text"
                                            value={formData.dosage}
                                            onChange={(e) => setFormData({ ...formData, dosage: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                                            placeholder="e.g., 2.5mg - 15mg"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Frequency</label>
                                        <input
                                            type="text"
                                            value={formData.frequency}
                                            onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                                            placeholder="e.g., Once weekly"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Duration</label>
                                        <input
                                            type="text"
                                            value={formData.duration}
                                            onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                                            placeholder="e.g., 12-16 weeks"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Sort Order</label>
                                        <input
                                            type="number"
                                            value={formData.sort_order}
                                            onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                                        />
                                    </div>
                                </div>

                                <div className="mb-4">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Storage Instructions</label>
                                    <input
                                        type="text"
                                        value={formData.storage}
                                        onChange={(e) => setFormData({ ...formData, storage: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                                        placeholder="e.g., Refrigerate at 2-8°C"
                                    />
                                </div>

                                <div className="mb-4">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Protocol Notes (one per line)</label>
                                    <textarea
                                        value={notesText}
                                        onChange={(e) => setNotesText(e.target.value)}
                                        rows={5}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                                        placeholder="Enter each note on a new line..."
                                    />
                                </div>
                            </>
                        )}

                        {/* File Upload */}
                        {formData.content_type === 'file' && (
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-2">Upload File (PDF, DOC, etc.)</label>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".pdf,.doc,.docx,.txt,.xls,.xlsx"
                                    onChange={handleFileSelect}
                                    className="hidden"
                                />
                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-all"
                                >
                                    {selectedFile ? (
                                        <div className="flex flex-col items-center gap-2">
                                            <FileText className="w-10 h-10 text-blue-500" />
                                            <p className="text-sm font-medium text-gray-900">{selectedFile.name}</p>
                                            <p className="text-xs text-gray-500">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                                            <p className="text-xs text-green-600">Click to change file</p>
                                        </div>
                                    ) : (formData.file_url || formData.file_path) ? (
                                        <div className="flex flex-col items-center gap-2">
                                            <FileText className="w-10 h-10 text-blue-500" />
                                            <p className="text-sm font-medium text-gray-900">File already uploaded</p>
                                            <a href={filePreview || formData.file_url || '#'} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 underline" onClick={(e) => e.stopPropagation()}>
                                                View current file
                                            </a>
                                            <p className="text-xs text-gray-500 mt-1">Click to upload a new file</p>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center gap-2">
                                            <Upload className="w-10 h-10 text-gray-400" />
                                            <p className="text-sm text-gray-600">Click to upload a file</p>
                                            <p className="text-xs text-gray-400">PDF, DOC, DOCX, TXT, XLS, XLSX</p>
                                        </div>
                                    )}
                                </div>
                                {uploading && (
                                    <div className="mt-3">
                                        <div className="w-full bg-gray-200 rounded-full h-2">
                                            <div className="bg-gray-900 h-2 rounded-full transition-all" style={{ width: `${uploadProgress}%` }}></div>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-1 text-center">Uploading... {uploadProgress}%</p>
                                    </div>
                                )}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Sort Order</label>
                                        <input
                                            type="number"
                                            value={formData.sort_order}
                                            onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Image Upload */}
                        {formData.content_type === 'image' && (
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-2">Upload Image</label>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={handleFileSelect}
                                    className="hidden"
                                />
                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-all"
                                >
                                    {filePreview || ((formData.file_url || formData.file_path) && !selectedFile) ? (
                                        <div className="flex flex-col items-center gap-2">
                                            <img
                                                src={filePreview || formData.file_url || ''}
                                                alt="Protocol preview"
                                                className="max-w-xs max-h-48 rounded-lg object-contain"
                                            />
                                            <p className="text-xs text-gray-500 mt-2">Click to change image</p>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center gap-2">
                                            <Image className="w-10 h-10 text-gray-400" />
                                            <p className="text-sm text-gray-600">Click to upload an image</p>
                                            <p className="text-xs text-gray-400">JPG, PNG, WebP, GIF, etc.</p>
                                        </div>
                                    )}
                                </div>
                                {uploading && (
                                    <div className="mt-3">
                                        <div className="w-full bg-gray-200 rounded-full h-2">
                                            <div className="bg-gray-900 h-2 rounded-full transition-all" style={{ width: `${uploadProgress}%` }}></div>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-1 text-center">Uploading... {uploadProgress}%</p>
                                    </div>
                                )}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Sort Order</label>
                                        <input
                                            type="number"
                                            value={formData.sort_order}
                                            onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Product assignment */}
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Assigned products ({productIds.length})
                            </label>
                            <p className="text-xs text-gray-500 mb-2">
                                Customers who order these products get this protocol in their protocol email.
                            </p>
                            <input
                                type="text"
                                value={productSearch}
                                onChange={(e) => setProductSearch(e.target.value)}
                                className="w-full px-3 py-2 mb-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                                placeholder="Search products..."
                            />
                            <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100" role="group" aria-label="Assigned products">
                                {products.length === 0 ? (
                                    <p className="text-sm text-gray-500 p-3">No products found.</p>
                                ) : (
                                    [...products]
                                        .filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase()) || productIds.includes(p.id))
                                        .sort((a, b) => Number(productIds.includes(b.id)) - Number(productIds.includes(a.id)) || a.name.localeCompare(b.name))
                                        .map(product => (
                                            <label key={product.id} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-800 hover:bg-gray-50 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={productIds.includes(product.id)}
                                                    onChange={(e) => setProductIds(prev => e.target.checked
                                                        ? [...prev, product.id]
                                                        : prev.filter(id => id !== product.id))}
                                                    className="w-4 h-4 text-gray-900 rounded focus:ring-gray-900"
                                                />
                                                {product.name}
                                            </label>
                                        ))
                                )}
                            </div>
                        </div>

                        <div className="flex items-center gap-2 mb-4">
                            <input
                                type="checkbox"
                                id="active"
                                checked={formData.active}
                                onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                                className="w-4 h-4 text-gray-900 rounded focus:ring-gray-900"
                            />
                            <label htmlFor="active" className="text-sm font-medium text-gray-700">Active (published: shown on the portal and used in future emails)</label>
                        </div>

                        <div className="flex items-center gap-3">
                            <button
                                onClick={handleSave}
                                disabled={isProcessing || uploading}
                                className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
                            >
                                <Save className="w-4 h-4" />
                                {uploading ? 'Uploading...' : isProcessing ? 'Saving...' : 'Save Protocol'}
                            </button>
                            <button
                                onClick={handleCancel}
                                className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                            >
                                <X className="w-4 h-4" />
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {/* Protocols List */}
                <div className="space-y-3">
                    {protocols.length === 0 ? (
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
                            <p className="text-gray-500">No protocols yet. Add your first protocol!</p>
                        </div>
                    ) : (
                        protocols.map((protocol) => (
                            <div
                                key={protocol.id}
                                className={`bg-white rounded-xl shadow-sm border ${protocol.active ? 'border-gray-200' : 'border-red-200 bg-red-50/30'} p-4`}
                            >
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-xs font-medium text-rose-500 uppercase tracking-wider">{protocol.category}</span>
                                            {protocol.content_type === 'file' && (
                                                <span className="text-xs font-medium text-blue-600 bg-blue-100 px-2 py-0.5 rounded flex items-center gap-1">
                                                    <FileText className="w-3 h-3" /> File
                                                </span>
                                            )}
                                            {protocol.content_type === 'image' && (
                                                <span className="text-xs font-medium text-purple-600 bg-purple-100 px-2 py-0.5 rounded flex items-center gap-1">
                                                    <Image className="w-3 h-3" /> Image
                                                </span>
                                            )}
                                            {protocol.active ? (
                                                <span className="text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded">Active</span>
                                            ) : (
                                                <span className="text-xs font-medium text-gray-600 bg-gray-200 px-2 py-0.5 rounded">Draft</span>
                                            )}
                                            <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded" title="Version">
                                                v{protocol.version ?? 1}
                                            </span>
                                        </div>
                                        <h3 className="font-semibold text-gray-900">{protocol.name}</h3>
                                        {protocol.content_type === 'text' ? (
                                            <p className="text-sm text-gray-600 mt-1">
                                                {protocol.dosage} • {protocol.frequency}
                                            </p>
                                        ) : (
                                            <p className="text-sm text-gray-500 mt-1">
                                                {protocol.content_type === 'file' ? 'File attached' : 'Image attached'}
                                            </p>
                                        )}
                                        {(() => {
                                            const names = (protocol.product_ids ?? [])
                                                .map(id => products.find(p => p.id === id)?.name)
                                                .filter(Boolean);
                                            return (
                                                <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                                                    <Package className="w-3 h-3" />
                                                    {names.length ? names.join(', ') : 'Not assigned to a product'}
                                                </p>
                                            );
                                        })()}
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => handleToggleActive(protocol.id, protocol.active)}
                                            disabled={isProcessing}
                                            className={`p-2 rounded-lg transition-colors ${protocol.active ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-100'}`}
                                            title={protocol.active ? 'Hide from website' : 'Show on website'}
                                        >
                                            {protocol.active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                                        </button>
                                        <button
                                            onClick={() => handleEdit(protocol)}
                                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                            title="Edit"
                                        >
                                            <Edit className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(protocol.id)}
                                            disabled={isProcessing}
                                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                            title="Delete"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default ProtocolManager;
