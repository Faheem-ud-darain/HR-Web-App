'use client';
import React, { useState } from 'react';
import { Profile, hrActions, updateProfileSelf } from '@/lib/hrData';
import { clearSession, SessionRole } from '@/lib/session';
import { Modal } from '@/components/ui/Modal';
import { AvatarCropperModal } from '@/components/ui/lazy';
import { compressImageToWebP, MAX_DOCUMENT_IMAGE_BYTES } from '@/lib/imageCompressor';
import { CaretRightIcon as ChevronRight, QuestionIcon as HelpCircle, SignOutIcon as LogOut } from '@phosphor-icons/react/dist/ssr';
import { Button } from '@/components/ui/Button';
import { useRouter } from 'next/navigation';
import { PoliciesSignOffStep } from "@/components/layout/onboarding/PoliciesSignOffStep";
import { DocumentsStep } from "@/components/layout/onboarding/DocumentsStep";
import { BankDetailsStep } from "@/components/layout/onboarding/BankDetailsStep";

// Wraps each page's content for the tab-switch fade+rise animation. Split
// out into its own component (rather than inlining a `page-enter` class
// directly) so we can strip the class via onAnimationEnd once the 320ms
// entrance finishes.
//
// Why this matters: `.page-enter`'s keyframes end on `transform:
// translateY(0)`, and `animation-fill-mode: both` retains that computed
// style forever once the animation completes — not just during the brief
// entrance. Per the CSS spec, ANY non-`none` transform (even an identity
// translateY(0)) turns its element into a new containing block for every
// `position: fixed` descendant nested inside it. Since this div wraps every
// dashboard page's content, that silently broke every fixed-position overlay
// that isn't portaled straight to document.body (e.g. UserProfileModal's
// hand-rolled card, TrackingView's screenshot lightbox): instead of covering
// the true viewport, they got clipped to this div's box, while the mobile
// floating pill nav — a sibling of this div, not a descendant — kept
// rendering at the real (unclipped) viewport edge, on top of everything.
// Stripping the class after the animation ends removes the stuck transform
// and restores normal fixed-position behavior for the rest of the page's
// lifetime.

// Employee onboarding stepper (bank details -> documents -> policies -> sign-off).
// Owns all of its own state; the dashboard layout mounts it while the signed-in
// employee's profile has `onboardingCompleted === false`.
export function OnboardingFlow({ profile, email, role }: { profile: Profile; email: string | null; role: SessionRole }) {
  const router = useRouter();
  // Onboarding States
  const [onboardStep, setOnboardStep] = useState(1);
  const [step2SubStep, setStep2SubStep] = useState(1);
  const [acceptedDocs, setAcceptedDocs] = useState({ conduct: false, handbook: false, privacy: false });
  const [signName, setSignName] = useState('');
  const [stepperError, setStepperError] = useState('');
  const [activePolicy, setActivePolicy] = useState<'conduct' | 'handbook' | 'privacy' | null>(null);

  // Bank & Profile Pic state
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [iban, setIban] = useState('');
  const [profilePicture, setProfilePicture] = useState<string | null>(null);
  const [uploadingPic] = useState(false);
  const [pendingPhotoFile, setPendingPhotoFile] = useState<File | null>(null);

  // Real document upload state — filename + base64 data for each file.
  // Images are compressed via compressImageToWebP (same as profile
  // pictures); PDFs are read as raw base64 with a size cap since they can't
  // be compressed client-side without a dedicated library.
  const [cvFile, setCvFile] = useState<string | null>(null);
  const [cvFileData, setCvFileData] = useState<string | null>(null);
  const [cnicFiles, setCnicFiles] = useState<string[]>([]);
  const [cnicFilesData, setCnicFilesData] = useState<string[]>([]);
  const [passportFile, setPassportFile] = useState<string | null>(null);
  const [passportFileData, setPassportFileData] = useState<string | null>(null);
  const [uploading, setUploading] = useState({ cv: false, cnic: false });
  const [uploadingPassport, setUploadingPassport] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // 4MB raw — base64 inflates ~33%

  const fileToBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

  const [isCompletingOnboarding, setIsCompletingOnboarding] = useState(false);

  const handleCvUpload = async (file: File | undefined) => {
    setUploadError('');
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError('CV file is too large. Please upload a file under 4MB.');
      return;
    }
    setUploading(prev => ({ ...prev, cv: true }));
    try {
      const data = await fileToBase64(file);
      setCvFileData(data);
      setCvFile(file.name);
    } catch (err) {
      console.error('CV upload failed:', err);
      setUploadError('Failed to read the file. Please try again.');
    } finally {
      setUploading(prev => ({ ...prev, cv: false }));
    }
  };

  const handleCnicUpload = async (file: File | undefined) => {
    setUploadError('');
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError('Image is too large. Please upload a file under 4MB.');
      return;
    }
    setUploading(prev => ({ ...prev, cnic: true }));
    try {
      const compressed = await compressImageToWebP(file, 0.75, MAX_DOCUMENT_IMAGE_BYTES);
      setCnicFilesData(prev => [...prev, compressed].slice(0, 2));
      setCnicFiles(prev => [...prev, file.name].slice(0, 2));
    } catch (err) {
      console.error('Identity doc upload failed:', err);
      // compressImageToWebP now rejects with a specific, actionable message
      // (e.g. "this looks like a HEIC photo") instead of silently storing
      // the raw uncompressed file — show that message when available.
      setUploadError(err instanceof Error ? err.message : 'Failed to process the image. Please try again.');
    } finally {
      setUploading(prev => ({ ...prev, cnic: false }));
    }
  };

  const handlePassportUpload = async (file: File | undefined) => {
    setUploadError('');
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError('Image is too large. Please upload a file under 4MB.');
      return;
    }
    setUploadingPassport(true);
    try {
      const compressed = await compressImageToWebP(file, 0.75, MAX_DOCUMENT_IMAGE_BYTES);
      setPassportFileData(compressed);
      setPassportFile(file.name);
    } catch (err) {
      console.error('Passport upload failed:', err);
      setUploadError(err instanceof Error ? err.message : 'Failed to process the image. Please try again.');
    } finally {
      setUploadingPassport(false);
    }
  };

  // Remove-and-reupload handlers for the onboarding document stepper — before
  // this, a wrong photo/CV/ID scan/passport picked by mistake was stuck once
  // uploaded (there was no way to clear it before hitting "Complete
  // Onboarding" — the profile picture's "Change" link could only replace it
  // by immediately picking a new file, not just remove the wrong one). These
  // just clear local component state; nothing has been submitted to
  // PocketBase yet at this point in the stepper (that only happens in
  // handleCompleteOnboarding), so there's nothing server-side to undo.
  const handleRemoveProfilePicture = () => {
    setProfilePicture(null);
    setPendingPhotoFile(null);
    setUploadError('');
  };
  const handleRemoveCv = () => {
    setCvFile(null);
    setCvFileData(null);
    setUploadError('');
  };
  const handleRemoveCnicFile = (idx: number) => {
    setCnicFiles(prev => prev.filter((_, i) => i !== idx));
    setCnicFilesData(prev => prev.filter((_, i) => i !== idx));
    setUploadError('');
  };
  const handleRemovePassport = () => {
    setPassportFile(null);
    setPassportFileData(null);
    setUploadError('');
  };

  const handleNextStep = () => {
    setStepperError('');
    if (onboardStep === 1) {
      if (!bankName.trim() || !accountNumber.trim() || !iban.trim()) {
        const docLabel = profile?.region === 'USA' ? 'Routing Number' : 'IBAN';
        setStepperError(`Required: All bank details (Bank Name, Account Number, and ${docLabel}) must be filled to proceed.`);
        return;
      }
      setOnboardStep(2);
      setStep2SubStep(1);
    } else if (onboardStep === 2) {
      if (step2SubStep === 1) {
        if (!profilePicture || !cvFile) {
          setStepperError('Required: Profile Picture and CV must be uploaded.');
          return;
        }
        setStep2SubStep(2);
      } else if (step2SubStep === 2) {
        const requiredCount = profile?.region === 'USA' ? 1 : 2;
        if (cnicFiles.length < requiredCount) {
          const docLabel = profile?.region === 'USA' ? 'Driver License / Work Permit' : 'CNIC images (Both Front and Back sides required)';
          setStepperError(`Required: ${docLabel} must be uploaded (${cnicFiles.length}/${requiredCount} uploaded).`);
          return;
        }
        if (profile?.region === 'USA') {
          setStep2SubStep(3);
        } else {
          setOnboardStep(3);
        }
      } else {
        // Sub-step 3 (Passport - Optional)
        setOnboardStep(3);
      }
    } else if (onboardStep === 3) {
      setOnboardStep(4);
    }
  };

  const handleCompleteOnboarding = async () => {
    setStepperError('');
    if (!signName || signName.trim().toLowerCase() !== profile?.fullName.trim().toLowerCase()) {
      setStepperError('Please sign with your exact full name to confirm.');
      return;
    }

    if (!acceptedDocs.conduct || !acceptedDocs.handbook || !acceptedDocs.privacy) {
      setStepperError('Please read and accept all policy documents.');
      return;
    }

    if (email && profile?.id) {
      setIsCompletingOnboarding(true);
      try {
        const isUsaEmployee = profile?.region === 'USA';

        // updateProfileSelf (server-side, scoped to the caller's own
        // session) automatically routes real hr_profiles columns
        // (bank/account/iban/profilePicture/onboardingCompleted) vs the KV
        // overlay fields (cv/identity/passport docs/approvalStatus) to the
        // right place — see /api/profile/me/route.ts.
        await updateProfileSelf({
          bankName,
          accountNumber,
          iban,
          profilePicture: profilePicture || undefined,
          onboardingCompleted: true,
          cvFileName: cvFile || undefined,
          cvFileData: cvFileData || undefined,
          identityDocs: cnicFilesData.length > 0
            ? cnicFilesData.map((data, idx) => ({
                name: cnicFiles[idx] || (isUsaEmployee ? 'License' : idx === 0 ? 'CNIC Front' : 'CNIC Back'),
                data
              }))
            : undefined,
          passportFileName: passportFile || undefined,
          passportFileData: passportFileData || undefined,
          // Gate: dashboard stays locked (see the approvalStatus check below)
          // until HR/Admin reviews the uploaded documents and approves.
          // Existing employees who onboarded before this feature shipped
          // have approvalStatus === undefined, which is deliberately treated
          // as "grandfathered in" everywhere this field is checked — only
          // fresh completions from here on get gated.
          approvalStatus: 'pending',
        });

        // Add review-needed notification instead of a "you're in" one —
        // the dashboard is not actually unlocked yet.
        await hrActions.addNotification('all', 'hr', `${profile.fullName} completed onboarding and is waiting for document approval.`);
        await hrActions.addNotification('all', 'admin', `${profile.fullName} completed onboarding and is waiting for document approval.`);

        // Reload to let React Query fetch fresh profile and show the
        // "waiting for review" screen instead of the stepper.
        window.location.reload();
      } catch (err) {
        console.error('Failed to complete onboarding:', err);
        setStepperError('Failed to save onboarding data. Please try again.');
      } finally {
        setIsCompletingOnboarding(false);
      }
    }
  };


    return (
      <div className="min-h-screen bg-slate-50 flex flex-col py-6 md:py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-xl mx-auto w-full bg-white border border-slate-200 rounded-xl p-4 sm:p-8 shadow-sm">
          
          {/* Header */}
          <div className="flex justify-between items-start pb-4 md:pb-6 border-b border-slate-200 mb-6 md:mb-8 gap-3">
            <div className="text-left">
              <h1 className="text-xl md:text-2xl font-bold text-slate-900">Employee Onboarding</h1>
              <p className="text-xs md:text-sm text-slate-500 mt-1.5">Welcome to DelCargo! Complete these simple steps to access your dashboard.</p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={async () => {
                await hrActions.performLogout(email || '', role);
                clearSession();
                router.push('/auth');
              }}
              title="Log out & change account"
              className="border border-slate-200 shrink-0 mt-1"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Back to Login</span>
            </Button>
          </div>

          {/* Stepper Indicators */}
          <div className="flex justify-between items-center mb-6 md:mb-8 relative">
            <div className="absolute left-0 right-0 h-0.5 bg-slate-200 top-1/2 -translate-y-1/2 z-0"></div>
            
            <div className={`flex items-center justify-center h-8 w-8 rounded-full text-xs font-bold z-10 ${
              onboardStep >= 1 ? 'bg-orange-600 text-white shadow-sm' : 'bg-slate-100 text-slate-400'
            }`}>
              1
            </div>
            <div className={`flex items-center justify-center h-8 w-8 rounded-full text-xs font-bold z-10 ${
              onboardStep >= 2 ? 'bg-orange-600 text-white shadow-sm' : 'bg-slate-100 text-slate-400'
            }`}>
              2
            </div>
            <div className={`flex items-center justify-center h-8 w-8 rounded-full text-xs font-bold z-10 ${
              onboardStep >= 3 ? 'bg-orange-600 text-white shadow-sm' : 'bg-slate-100 text-slate-400'
            }`}>
              3
            </div>
            <div className={`flex items-center justify-center h-8 w-8 rounded-full text-xs font-bold z-10 ${
              onboardStep >= 4 ? 'bg-orange-600 text-white shadow-sm' : 'bg-slate-100 text-slate-400'
            }`}>
              4
            </div>
          </div>

          {/* Error notice */}
          {stepperError && (
            <div className="p-3 text-xs bg-rose-50 text-rose-600 border border-rose-100 rounded-lg font-semibold mb-6 fade-enter">
              {stepperError}
            </div>
          )}

          {/* Step 1: Confirmation */}
          {onboardStep === 1 && (
            <BankDetailsStep profile={profile} bankName={bankName} setBankName={setBankName} accountNumber={accountNumber} setAccountNumber={setAccountNumber} iban={iban} setIban={setIban} email={email} role={role} router={router} handleNextStep={handleNextStep} />
          )}

          {/* Step 2: Document Uploader Simulator */}
          {onboardStep === 2 && (
            <DocumentsStep step2SubStep={step2SubStep} uploadError={uploadError} profilePicture={profilePicture} setPendingPhotoFile={setPendingPhotoFile} handleRemoveProfilePicture={handleRemoveProfilePicture} uploadingPic={uploadingPic} cvFile={cvFile} uploading={uploading} handleCvUpload={handleCvUpload} handleRemoveCv={handleRemoveCv} profile={profile} cnicFiles={cnicFiles} handleCnicUpload={handleCnicUpload} handleRemoveCnicFile={handleRemoveCnicFile} passportFile={passportFile} uploadingPassport={uploadingPassport} handlePassportUpload={handlePassportUpload} handleRemovePassport={handleRemovePassport} setStep2SubStep={setStep2SubStep} setOnboardStep={setOnboardStep} handleNextStep={handleNextStep} />
          )}

          {/* Step 3: Features Guide */}
          {onboardStep === 3 && (
            <div className="space-y-6">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <HelpCircle className="h-5 w-5 text-orange-600" /> Step 3: Platform Features Guide
              </h2>
              <p className="text-sm text-slate-600">Review the features available on your DelCargo portal:</p>

              <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2">
                <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/50">
                  <h4 className="text-sm font-semibold text-slate-900">1. My Dashboard</h4>
                  <p className="text-xs text-slate-500 mt-1">Check active balances for paid time off (PTO) and sick leaves. View the target release dates for monthly salaries.</p>
                </div>
                <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/50">
                  <h4 className="text-sm font-semibold text-slate-900">2. Leave Management</h4>
                  <p className="text-xs text-slate-500 mt-1">Submit new leave requests by selecting dates and a reason. Track approvals as HR and CEOs update them in real time.</p>
                </div>
                <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/50">
                  <h4 className="text-sm font-semibold text-slate-900">3. Salary Ledgers</h4>
                  <p className="text-xs text-slate-500 mt-1">Access detailed payslips. View base pay configurations, performance bonus credits, and leaf-deduction breakdowns.</p>
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-200">
                <Button
                  variant="outline"
                  size="md"
                  onClick={() => setOnboardStep(2)}
                  className="flex-1 md:flex-none"
                >
                  Back
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  onClick={handleNextStep}
                  className="flex-1"
                >
                  Continue <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 4: Sign Off & Policies */}
          {onboardStep === 4 && (
            <PoliciesSignOffStep setActivePolicy={setActivePolicy} acceptedDocs={acceptedDocs} setAcceptedDocs={setAcceptedDocs} profile={profile} signName={signName} setSignName={setSignName} setOnboardStep={setOnboardStep} handleCompleteOnboarding={handleCompleteOnboarding} isCompletingOnboarding={isCompletingOnboarding} />
          )}

        </div>

        {activePolicy && (
          <Modal 
            isOpen 
            onClose={() => setActivePolicy(null)} 
            title={
              activePolicy === 'conduct' ? 'Code of Conduct' :
              activePolicy === 'handbook' ? 'Employee Handbook' :
              'Privacy & Data Policy'
            }
          >
            <div className="space-y-4 pt-1 font-sans text-xs text-slate-700 leading-relaxed font-semibold">
              {activePolicy === 'conduct' && (
                <p>
                  DelCargo is committed to maintaining a workplace that is respectful, inclusive, and professional. 
                  All staff members are expected to act with high integrity, communicate transparently across remote teams, 
                  and report conflicts directly to HR coordinators. Performance reviews are executed periodically.
                </p>
              )}
              {activePolicy === 'handbook' && (
                <div className="space-y-2">
                  <p>The Employee Handbook sets forth our workplace expectations, leave management timelines, and payroll processing parameters.</p>
                  <ul className="list-disc pl-4 space-y-1">
                    <li>Leave requests require 2 weeks notice except for emergency leaves.</li>
                    <li>Salary releases occur on the designated payouts schedules.</li>
                    <li>Annual promotion increments are calculated natively by regional status.</li>
                  </ul>
                </div>
              )}
              {activePolicy === 'privacy' && (
                <p>
                  Your privacy is paramount. Personal banking details, files, and location access records are kept strictly confidential. 
                  Our monitoring systems verify workstation logs and geofencing checkpoints to maintain secure log chains. 
                  Data processing complies with local regional standards.
                </p>
              )}
              <div className="flex justify-end pt-4 border-t border-slate-200 mt-4">
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => setActivePolicy(null)}
                >
                  Close Policy
                </Button>
              </div>
            </div>
          </Modal>
        )}

        <AvatarCropperModal
          file={pendingPhotoFile}
          onClose={() => setPendingPhotoFile(null)}
          onSave={(webpDataUrl) => {
            setProfilePicture(webpDataUrl);
            setPendingPhotoFile(null);
          }}
        />
      </div>
    );
}
