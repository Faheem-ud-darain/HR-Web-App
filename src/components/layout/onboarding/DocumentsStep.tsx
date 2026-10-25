'use client';

import React from 'react';
import { Upload, CheckCircle2, X, FileText, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Profile } from '@/lib/hrData';

interface DocumentsStepProps {
  step2SubStep: number;
  uploadError: string;
  profilePicture: string | null;
  setPendingPhotoFile: React.Dispatch<React.SetStateAction<File | null>>;
  handleRemoveProfilePicture: () => void;
  uploadingPic: boolean;
  cvFile: string | null;
  uploading: { cv: boolean; cnic: boolean; };
  handleCvUpload: (file: File | undefined) => Promise<void>;
  handleRemoveCv: () => void;
  profile: Profile;
  cnicFiles: string[];
  handleCnicUpload: (file: File | undefined) => Promise<void>;
  handleRemoveCnicFile: (idx: number) => void;
  passportFile: string | null;
  uploadingPassport: boolean;
  handlePassportUpload: (file: File | undefined) => Promise<void>;
  handleRemovePassport: () => void;
  setStep2SubStep: React.Dispatch<React.SetStateAction<number>>;
  setOnboardStep: React.Dispatch<React.SetStateAction<number>>;
  handleNextStep: () => void;
}

export function DocumentsStep({ step2SubStep, uploadError, profilePicture, setPendingPhotoFile, handleRemoveProfilePicture, uploadingPic, cvFile, uploading, handleCvUpload, handleRemoveCv, profile, cnicFiles, handleCnicUpload, handleRemoveCnicFile, passportFile, uploadingPassport, handlePassportUpload, handleRemovePassport, setStep2SubStep, setOnboardStep, handleNextStep }: DocumentsStepProps) {
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
        <Upload className="h-5 w-5 text-orange-600" /> Step 2: Upload Documents ({step2SubStep}/3)
      </h2>
      {uploadError && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 font-semibold px-3 py-2 rounded-lg text-xs">
          {uploadError}
        </div>
      )}
    
      {step2SubStep === 1 && (
        <>
          <p className="text-sm text-slate-600 font-medium">Please upload your profile picture and CV:</p>
          <div className="space-y-4">
            {/* Profile Pic box */}
            <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/50 flex flex-col justify-between min-h-[100px]">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                <div>
                  <span className="text-sm font-bold text-slate-900">1. Profile Picture (Mandatory) *</span>
                  <p className="text-[10px] text-slate-400 mt-0.5">JPG or PNG format. Front facing photo.</p>
                </div>
                {profilePicture ? (
                  <div className="flex items-center gap-2">
                    <img src={profilePicture} alt="Preview" className="h-8 w-8 rounded-full object-cover border border-slate-200" />
                    <span className="text-emerald-600 font-bold text-xs flex items-center gap-0.5"><CheckCircle2 className="h-4 w-4" /> Added</span>
                    <label className="text-[10px] text-slate-500 hover:text-orange-600 font-bold cursor-pointer underline">
                      Change
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          if (file) setPendingPhotoFile(file);
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={handleRemoveProfilePicture}
                      title="Remove photo"
                      className="h-5 w-5 shrink-0 flex items-center justify-center rounded-full bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : uploadingPic ? (
                  <span className="text-slate-400 text-xs animate-pulse">Uploading photo...</span>
                ) : (
                  <label className="text-xs bg-orange-600 text-white hover:bg-orange-700 px-3 py-1.5 rounded cursor-pointer font-bold select-none transition-colors transition-transform active:scale-97 text-center self-start sm:self-auto min-w-[100px]">
                    Upload Photo
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (file) setPendingPhotoFile(file);
                      }}
                    />
                  </label>
                )}
              </div>
            </div>
    
            {/* CV file box */}
            <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/50 flex flex-col justify-between min-h-[100px]">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                <div>
                  <span className="text-sm font-bold text-slate-900">2. Curriculum Vitae (CV) *</span>
                  <p className="text-[10px] text-slate-400 mt-0.5">PDF only, under 4MB</p>
                </div>
                {cvFile ? (
                  <span className="text-emerald-600 font-bold text-xs flex items-center gap-1"><CheckCircle2 className="h-4 w-4" /> Uploaded</span>
                ) : uploading.cv ? (
                  <span className="text-slate-400 text-xs animate-pulse">Uploading file...</span>
                ) : (
                  <label className="text-xs bg-orange-600 text-white hover:bg-orange-700 px-3 py-1.5 rounded cursor-pointer font-bold select-none transition-colors transition-transform active:scale-97 text-center self-start sm:self-auto min-w-[100px]">
                    Upload PDF
                    <input 
                      type="file" 
                      accept=".pdf"
                      className="hidden"
                      onChange={(e) => handleCvUpload(e.target.files?.[0])}
                    />
                  </label>
                )}
              </div>
              {cvFile && (
                <div className="text-xs font-semibold text-slate-600 mt-3 flex items-center justify-between gap-2 bg-white p-2 rounded border border-slate-200">
                  <span className="flex items-center gap-1 truncate"><FileText className="h-4 w-4 text-orange-600 shrink-0" /> {cvFile}</span>
                  <button
                    type="button"
                    onClick={handleRemoveCv}
                    title="Remove and re-upload"
                    className="h-5 w-5 shrink-0 flex items-center justify-center rounded-full bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    
      {step2SubStep === 2 && (
        <>
          <p className="text-sm text-slate-600 font-medium">Please upload your identification scan:</p>
          <div className="space-y-4">
            {/* CNIC or Driver License file box */}
            <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/50 flex flex-col justify-between min-h-[100px]">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                <div>
                  <span className="text-sm font-bold text-slate-900">
                    3. {profile?.region === 'USA' ? 'Driver License / Work Permit *' : 'CNIC Card (Both Sides) *'}
                  </span>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {profile?.region === 'USA' ? 'Upload 1 front scan.' : 'Upload 2 scans (Front and Back side scans required).'}
                  </p>
                </div>
                {cnicFiles.length >= (profile?.region === 'USA' ? 1 : 2) ? (
                  <span className="text-emerald-600 font-bold text-xs flex items-center gap-1"><CheckCircle2 className="h-4 w-4" /> All Scans Added</span>
                ) : uploading.cnic ? (
                  <span className="text-slate-400 text-xs animate-pulse">Uploading scans...</span>
                ) : (
                  <label className="text-xs bg-orange-600 text-white hover:bg-orange-700 px-3 py-1.5 rounded cursor-pointer font-bold select-none transition-colors transition-transform active:scale-97 text-center self-start sm:self-auto min-w-[100px]">
                    {cnicFiles.length > 0 ? `Upload Scan #${cnicFiles.length + 1}` : 'Upload Scan'}
                    <input 
                      type="file" 
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleCnicUpload(e.target.files?.[0])}
                    />
                  </label>
                )}
              </div>
              {cnicFiles.length > 0 && (
                <div className="space-y-1.5 mt-3">
                  {cnicFiles.map((file, idx) => (
                    <div key={idx} className="text-xs font-semibold text-slate-600 flex items-center justify-between gap-2 bg-white p-2 rounded border border-slate-200">
                      <span className="flex items-center gap-1 truncate"><FileText className="h-4 w-4 text-orange-600 shrink-0" /> {file}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveCnicFile(idx)}
                        title="Remove and re-upload"
                        className="h-5 w-5 shrink-0 flex items-center justify-center rounded-full bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    
      {step2SubStep === 3 && (
        <>
          <p className="text-sm text-slate-600 font-medium">Please upload secondary documents (Optional):</p>
          <div className="space-y-4">
            {/* Optional Passport file box for USA only */}
            <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/50 flex flex-col justify-between min-h-[100px]">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                <div>
                  <span className="text-sm font-bold text-slate-900">4. Passport (Secondary ID) (Optional)</span>
                  <p className="text-[10px] text-slate-400 mt-0.5">JPG or PNG image scan. Optional.</p>
                </div>
                {passportFile ? (
                  <span className="text-emerald-600 font-bold text-xs flex items-center gap-1"><CheckCircle2 className="h-4 w-4" /> Uploaded</span>
                ) : uploadingPassport ? (
                  <span className="text-slate-400 text-xs animate-pulse">Uploading scans...</span>
                ) : (
                  <label className="text-xs bg-orange-600 text-white hover:bg-orange-700 px-3 py-1.5 rounded cursor-pointer font-bold select-none transition-colors transition-transform active:scale-97 text-center self-start sm:self-auto min-w-[100px]">
                    Upload Scan
                    <input 
                      type="file" 
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handlePassportUpload(e.target.files?.[0])}
                    />
                  </label>
                )}
              </div>
              {passportFile && (
                <div className="text-xs font-semibold text-slate-600 mt-3 flex items-center justify-between gap-2 bg-white p-2 rounded border border-slate-200">
                  <span className="flex items-center gap-1 truncate"><FileText className="h-4 w-4 text-orange-600 shrink-0" /> {passportFile}</span>
                  <button
                    type="button"
                    onClick={handleRemovePassport}
                    title="Remove and re-upload"
                    className="h-5 w-5 shrink-0 flex items-center justify-center rounded-full bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    
      <div className="flex gap-3 pt-4 border-t border-slate-200">
        <Button
          type="button"
          variant="outline"
          size="md"
          onClick={() => {
            if (step2SubStep === 3) setStep2SubStep(2);
            else if (step2SubStep === 2) setStep2SubStep(1);
            else setOnboardStep(1);
          }}
          className="flex-1 md:flex-none"
        >
          Back
        </Button>
        {step2SubStep === 3 && (
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={() => setOnboardStep(3)}
            className="flex-1 md:flex-none border border-slate-200"
          >
            Skip Optional Step
          </Button>
        )}
        <Button
          type="button"
          variant="primary"
          size="md"
          onClick={handleNextStep}
          className="flex-1"
        >
          {step2SubStep === 3 ? 'Finish Step 2' : 'Confirm & Continue'} <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
