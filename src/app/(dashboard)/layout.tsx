'use client';

import React, { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopNav } from '@/components/layout/TopNav';
import { useRouter, usePathname } from 'next/navigation';
import { Profile, hrActions, useProfiles } from '@/lib/hrData';
import {
  getSessionEmail,
  getSessionRole,
  getSessionToken,
  clearSession,
  hydrateSessionFromNativeStorage,
  isValidRole,
  dashboardSectionForRole,
  SessionRole,
  getOrCreateDeviceId,
} from '@/lib/session';
import { initPush } from '@/lib/push';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { AvatarCropperModal } from '@/components/ui/AvatarCropperModal';
import { AnnouncementPopup } from '@/components/ui/AnnouncementPopup';
import { AbsentPopup } from '@/components/ui/AbsentPopup';
import { MaintenanceNoticePopup } from '@/components/ui/MaintenanceNoticePopup';
import { PushPermissionPrompt } from '@/components/ui/PushPermissionPrompt';
import { NativeBackButtonHandler } from '@/components/layout/NativeBackButtonHandler';
import { SmartInactivityMonitor } from '@/components/ui/SmartInactivityMonitor';
import { compressImageToWebP, MAX_DOCUMENT_IMAGE_BYTES } from '@/lib/imageCompressor';
import { useAnyModalOpen } from '@/lib/modalStack';
import { CheckCircle2, ChevronRight, BookOpen, User, ShieldCheck, ShieldAlert, HelpCircle, FileText, Upload, LogOut } from 'lucide-react';

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
function PageTransition({ className, children }: { className: string; children: React.ReactNode }) {
  const [animating, setAnimating] = useState(true);
  return (
    <div
      onAnimationEnd={() => setAnimating(false)}
      className={`${className} ${animating ? 'page-enter' : ''}`}
    >
      {children}
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Widened to include 'team_lead' — it's a real value Profile.role/session
  // can hold (see src/lib/hrData.ts), not just 'admin' | 'hr' | 'employee'.
  // Sidebar already accepts it directly; anywhere this layout needs to
  // reason about *which dashboard section* a role belongs to (RBAC route
  // checks, onboarding/approval gates below) goes through
  // dashboardSectionForRole() instead of comparing this raw value, so
  // team_lead is never mistaken for "not employee".
  const [role, setRole] = useState<SessionRole | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  
  // Onboarding States
  const [onboardStep, setOnboardStep] = useState(1);
  const [step2SubStep, setStep2SubStep] = useState(1);
  const [acceptedDocs, setAcceptedDocs] = useState({ conduct: false, handbook: false, privacy: false });
  const [signName, setSignName] = useState('');
  const [stepperError, setStepperError] = useState('');
  const [showConsent, setShowConsent] = useState(false);
  const [activePolicy, setActivePolicy] = useState<'conduct' | 'handbook' | 'privacy' | null>(null);

  // Bank & Profile Pic state
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [iban, setIban] = useState('');
  const [region, setRegion] = useState<'USA' | 'Pakistan'>('Pakistan');
  const [profilePicture, setProfilePicture] = useState<string | null>(null);
  const [uploadingPic, setUploadingPic] = useState(false);
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

  const [dbReady, setDbReady] = useState(false);
  const [isCompletingOnboarding, setIsCompletingOnboarding] = useState(false);
  const router = useRouter();
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const isChatScreen = pathname?.endsWith('/chat') || pathname?.endsWith('/team-chats');
  // Support Tickets has its own bottom-anchored reply composer, same as Team
  // Chat — the floating pill nav (Sidebar.tsx) now hides on both for the
  // same reason. Since neither screen needs to reserve space for that pill
  // anymore, they get a small fixed bottom breathing-room padding instead of
  // the large pb-24 other tabs use to clear it.
  const isTicketsScreen = pathname?.endsWith('/tickets');
  // When the ticket conversation panel is open it calls pushModal() (see
  // TicketsView.tsx) — subscribe to that signal so we can switch the tickets
  // screen's <main> to overflow-hidden while it's open. Without this, the
  // OS keyboard-avoidance sees a scrollable page behind the fixed panel and
  // tries to pan/resize the scroll container, pushing the whole panel up.
  // Identical fix to isChatScreen, which already uses overflow-hidden.
  const anyModalOpen = useAnyModalOpen();
  const isTicketPanelOpen = isTicketsScreen && anyModalOpen;

  const { data: allProfiles, isLoading: isProfilesLoading } = useProfiles();

  // Redirect if unauthorized.
  //
  // IMPORTANT: this used to compare pathname against the *raw* profile.role,
  // which is broken for team_lead accounts — team_lead shares the /employee
  // dashboard (there is no /team_lead route), so `profile.role !== 'employee'`
  // was true for every team lead on their own dashboard, and
  // `router.push('/team_lead')` sent them to a route that doesn't exist
  // (a dead page, not a redirect to safety). Always resolve through
  // dashboardSectionForRole() first so this can only ever push to
  // '/admin', '/hr', or '/employee' — one of the three sections that
  // actually exist under this layout.
  useEffect(() => {
    if (!isProfilesLoading && profile && isValidRole(profile.role)) {
      const section = dashboardSectionForRole(profile.role);
      if (pathname.startsWith('/admin') && section !== 'admin') {
        router.push(`/${section}`);
      } else if (pathname.startsWith('/hr') && !['hr', 'admin'].includes(section)) {
        router.push(`/${section}`);
      } else if (pathname.startsWith('/employee') && section !== 'employee') {
        router.push(`/${section}`);
      }
    }
  }, [pathname, profile, isProfilesLoading, router]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // On native, restores localStorage from durable Preferences storage
      // first if the WebView's own copy went missing — see the big comment
      // in session.ts for why that can happen even with "Remember me"
      // checked. No-op on web, and a no-op here on every load after the
      // first (it only does anything when localStorage is actually empty).
      await hydrateSessionFromNativeStorage();
      if (cancelled) return;

      const rawRole = getSessionRole();
      const savedEmail = getSessionEmail();

      // Validate the role value itself, not just its presence — a
      // corrupted/stale/unknown role should be treated the same as "not
      // logged in" rather than being trusted and set into state, where it
      // could otherwise get handed to Sidebar or compared against pathnames
      // that don't account for it.
      if (!rawRole || !savedEmail || !isValidRole(rawRole)) {
        if (rawRole && !isValidRole(rawRole)) clearSession();
        router.push('/auth');
      } else {
        const savedRole = rawRole;
        setRole(savedRole);
        setEmail(savedEmail);

        if (!isProfilesLoading && allProfiles) {
          setDbReady(true);
          const userProfile = allProfiles.find(e => e && e.email && e.email.toLowerCase() === savedEmail.toLowerCase()) as any;
          if (userProfile) {
            setProfile(userProfile);
          }

          // team_lead accounts go through the same onboarding/consent flow
          // as employee — they're employees first, lead status is layered
          // on top (see hrData.ts / Sidebar.tsx).
          if ((savedRole === 'employee' || savedRole === 'team_lead') && (!userProfile || !userProfile.onboardingCompleted)) {
            const consent = localStorage.getItem(`consent_accepted_${savedEmail}`);
            if (!consent) {
              setShowConsent(true);
            }
          }
        }
      }
    })();
    return () => { cancelled = true; };
  }, [router, allProfiles, isProfilesLoading]);

  // Register this device/browser for push notifications and link it to the
  // signed-in user (as OneSignal's "external ID") so they can be targeted
  // individually later, not just as part of a broadcast to everyone.
  // No-ops until an App ID is configured in src/lib/push.ts.
  useEffect(() => {
    if (email) initPush(email);
  }, [email]);

  // Two related staleness problems, one fix: React Query's
  // refetchOnWindowFocus is deliberately off (see providers.tsx) so
  // switching tabs/apps on desktop doesn't refire every active query, but
  // that meant NOTHING refreshed data when the native app came back from
  // the background — the bell, tickets, chat, etc. all sat on whatever was
  // last loaded until the app was fully killed and relaunched. The Page
  // Visibility API fires reliably in a Capacitor WebView on both iOS and
  // Android when the app is backgrounded/foregrounded (it's not a browser
  // tab from the WebView's perspective, but the same underlying event),
  // so listening for it here and invalidating every active query is a
  // Capacitor-app-appropriate substitute for refetchOnWindowFocus without
  // turning that global default back on for the desktop web case it was
  // presumably disabled for.
  //
  // Also re-runs initPush(email) on the same trigger — self-heals the case
  // where OneSignal's external_id login raced the push subscription being
  // created on a brand-new install (see the comment in push.ts's
  // initNative) by re-attempting the login every time the app resumes, not
  // just once at first launch.
  useEffect(() => {
    const handleVisible = () => {
      if (document.visibilityState !== 'visible') return;
      queryClient.invalidateQueries();
      if (email) initPush(email);
    };
    document.addEventListener('visibilitychange', handleVisible);
    return () => document.removeEventListener('visibilitychange', handleVisible);
  }, [email, queryClient]);



  const handleConsentAccept = () => {
    if (email) {
      localStorage.setItem(`consent_accepted_${email}`, 'true');
      setShowConsent(false);
    }
  };

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
      setUploadError('Failed to process the image. Please try again.');
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
      setUploadError('Failed to process the image. Please try again.');
    } finally {
      setUploadingPassport(false);
    }
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

        // hrActions.updateProfileDetails automatically routes real
        // hr_profiles columns (bank/account/iban/profilePicture/
        // onboardingCompleted) vs the KV overlay fields (cv/identity/
        // passport docs) to the right place.
        await hrActions.updateProfileDetails(profile.id, {
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

  if (!dbReady || !role || ((role === 'employee' || role === 'team_lead') && !profile)) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <svg className="animate-spin h-8 w-8 text-orange-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
    );
  }

  // Force onboarding stepper gate if user is employee (or team_lead, who is
  // an employee first) and onboarding is incomplete
  if ((role === 'employee' || role === 'team_lead') && profile && !profile.onboardingCompleted) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col py-6 md:py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-xl mx-auto w-full bg-white border border-slate-200 rounded-xl p-4 sm:p-8 shadow-sm">
          
          {/* Header */}
          <div className="flex justify-between items-start pb-4 md:pb-6 border-b border-slate-200 mb-6 md:mb-8 gap-3">
            <div className="text-left">
              <h1 className="text-xl md:text-2xl font-bold text-slate-900">Employee Onboarding</h1>
              <p className="text-xs md:text-sm text-slate-500 mt-1.5">Welcome to DelCargo! Complete these simple steps to access your dashboard.</p>
            </div>
            <button
              type="button"
              onClick={async () => {
                await hrActions.performLogout(email || '', role);
                clearSession();
                router.push('/auth');
              }}
              title="Log out & change account"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-200 px-3 py-1.5 rounded-lg transition-colors shrink-0 mt-1"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Back to Login</span>
            </button>
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
            <div className="space-y-4 md:space-y-6">
              <h2 className="text-base md:text-lg font-bold text-slate-900 flex items-center gap-2">
                <User className="h-4 w-4 md:h-5 md:w-5 text-orange-600" /> Step 1: Profile & Bank Details
              </h2>
              
              <div className="space-y-4">
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200/50 space-y-2.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-slate-500">Full Name</span>
                    <span className="font-semibold text-slate-900">{profile.fullName}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-slate-500">Email</span>
                    <span className="font-semibold text-slate-900">{profile.email}</span>
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest">Bank details (for Salaries)</h3>
                  
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Bank Name *</label>
                    <input
                      type="text"
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      placeholder="e.g. Chase Bank / Habib Bank"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-xs focus:border-orange-500 outline-none font-medium text-slate-800"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Account Number *</label>
                      <input
                        type="text"
                        value={accountNumber}
                        onChange={(e) => setAccountNumber(e.target.value)}
                        placeholder="10-16 digits"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-xs focus:border-orange-500 outline-none font-medium text-slate-800"
                      />
                    </div>
                     <div className="space-y-1">
                       <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                         {profile?.region === 'USA' ? 'Routing Number *' : 'IBAN *'}
                       </label>
                       <input
                         type="text"
                         value={iban}
                         onChange={(e) => setIban(e.target.value)}
                         placeholder={profile?.region === 'USA' ? 'e.g. 021000021 (9 digits)' : 'e.g. PK98HABB...'}
                         className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-xs focus:border-orange-500 outline-none font-medium text-slate-800"
                       />
                     </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center pt-4 border-t border-slate-200 gap-3">
                <button
                  type="button"
                  onClick={async () => {
                    await hrActions.performLogout(email || '', role);
                    clearSession();
                    router.push('/auth');
                  }}
                  className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-200 px-4 py-2.5 rounded-xl transition-colors"
                >
                  <LogOut className="h-4 w-4" /> Back to Login
                </button>
                <button 
                  onClick={handleNextStep}
                  className="bg-orange-600 hover:bg-orange-700 text-white font-semibold px-4 py-2.5 rounded-xl text-sm active:scale-97 transition-colors flex items-center justify-center gap-1"
                >
                  Confirm & Continue <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Document Uploader Simulator */}
          {onboardStep === 2 && (
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
                          <p className="text-[10px] text-slate-400 mt-0.5">PDF or Word format under 5MB</p>
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
                        <div className="text-xs font-semibold text-slate-600 mt-3 flex items-center gap-1 bg-white p-2 rounded border border-slate-200">
                          <FileText className="h-4 w-4 text-orange-600" /> {cvFile}
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
                            <div key={idx} className="text-xs font-semibold text-slate-600 flex items-center gap-1 bg-white p-2 rounded border border-slate-200">
                              <FileText className="h-4 w-4 text-orange-600" /> {file}
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
                        <div className="text-xs font-semibold text-slate-600 mt-3 flex items-center gap-1 bg-white p-2 rounded border border-slate-200">
                          <FileText className="h-4 w-4 text-orange-600" /> {passportFile}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

              <div className="flex gap-3 pt-4 border-t border-slate-200">
                <button 
                  type="button"
                  onClick={() => {
                    if (step2SubStep === 3) setStep2SubStep(2);
                    else if (step2SubStep === 2) setStep2SubStep(1);
                    else setOnboardStep(1);
                  }}
                  className="flex-1 md:flex-none bg-white border border-slate-200 text-slate-700 font-semibold px-4 py-3 md:py-2 rounded-xl md:rounded-lg text-xs md:text-sm active:scale-97 transition-transform"
                >
                  Back
                </button>
                {step2SubStep === 3 && (
                  <button 
                    type="button"
                    onClick={() => setOnboardStep(3)}
                    className="flex-1 md:flex-none bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 font-semibold px-4 py-3 md:py-2 rounded-xl md:rounded-lg text-xs md:text-sm active:scale-97 transition-colors transition-transform"
                  >
                    Skip Optional Step
                  </button>
                )}
                <button 
                  type="button"
                  onClick={handleNextStep}
                  className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-semibold px-4 py-3 md:py-2 rounded-xl md:rounded-lg text-xs md:text-sm active:scale-97 transition-colors transition-transform flex items-center justify-center gap-1"
                >
                  {step2SubStep === 3 ? 'Finish Step 2' : 'Confirm & Continue'} <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
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
                <button 
                  onClick={() => setOnboardStep(2)}
                  className="flex-1 md:flex-none bg-white border border-slate-200 text-slate-700 font-semibold px-4 py-3 md:py-2 rounded-xl md:rounded-lg text-sm active:scale-97 transition-transform"
                >
                  Back
                </button>
                <button 
                  onClick={handleNextStep}
                  className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-semibold px-4 py-3 md:py-2 rounded-xl md:rounded-lg text-sm active:scale-97 transition-colors transition-transform flex items-center justify-center gap-1"
                >
                  Continue <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Sign Off & Policies */}
          {onboardStep === 4 && (
            <div className="space-y-6">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-orange-600" /> Step 4: Policies & Sign Off
              </h2>
              <p className="text-sm text-slate-600 font-medium">Please read and acknowledge the shared corporate guidelines:</p>

              <div className="space-y-4 max-h-[200px] overflow-y-auto pr-2">
                <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/20">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1.5">
                      <span className="text-sm font-semibold text-slate-900">Code of Conduct</span>
                      <button 
                        type="button" 
                        onClick={() => setActivePolicy('conduct')} 
                        className="text-[10px] font-bold text-orange-600 hover:underline text-left"
                      >
                        (Read Agreement)
                      </button>
                    </div>
                    <input 
                      type="checkbox" 
                      checked={acceptedDocs.conduct}
                      onChange={(e) => setAcceptedDocs(prev => ({ ...prev, conduct: e.target.checked }))}
                      className="h-4 w-4 text-orange-600 rounded border-slate-300 focus:ring-orange-500"
                    />
                  </div>
                  <p className="text-xs text-slate-500">Professional interaction guidelines and conflict resolution frameworks.</p>
                </div>

                <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/20">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1.5">
                      <span className="text-sm font-semibold text-slate-900">Employee Handbook</span>
                      <button 
                        type="button" 
                        onClick={() => setActivePolicy('handbook')} 
                        className="text-[10px] font-bold text-orange-600 hover:underline text-left"
                      >
                        (Read Agreement)
                      </button>
                    </div>
                    <input 
                      type="checkbox" 
                      checked={acceptedDocs.handbook}
                      onChange={(e) => setAcceptedDocs(prev => ({ ...prev, handbook: e.target.checked }))}
                      className="h-4 w-4 text-orange-600 rounded border-slate-300 focus:ring-orange-500"
                    />
                  </div>
                  <p className="text-xs text-slate-500">Detailed guidelines on leave policies, salary increment cycles, and tools usage.</p>
                </div>

                <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/20">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1.5">
                      <span className="text-sm font-semibold text-slate-900">Privacy & Data Policy</span>
                      <button 
                        type="button" 
                        onClick={() => setActivePolicy('privacy')} 
                        className="text-[10px] font-bold text-orange-600 hover:underline text-left"
                      >
                        (Read Agreement)
                      </button>
                    </div>
                    <input 
                      type="checkbox" 
                      checked={acceptedDocs.privacy}
                      onChange={(e) => setAcceptedDocs(prev => ({ ...prev, privacy: e.target.checked }))}
                      className="h-4 w-4 text-orange-600 rounded border-slate-300 focus:ring-orange-500"
                    />
                  </div>
                  <p className="text-xs text-slate-500">Privacy guarantees and guidelines for processing corporate and customer data.</p>
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Digital Signature <span className="text-slate-400 font-semibold text-[10px] lowercase">(Case-insensitive: must match your full name "{profile.fullName}" exactly)</span>
                </label>
                <input 
                  type="text" 
                  value={signName}
                  onChange={(e) => setSignName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 px-3 text-sm focus:border-orange-500 outline-none text-slate-900 font-medium"
                  placeholder={profile.fullName}
                />
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-200">
                <button 
                  onClick={() => setOnboardStep(3)}
                  className="flex-1 md:flex-none bg-white border border-slate-200 text-slate-700 font-semibold px-4 py-3 md:py-2 rounded-xl md:rounded-lg text-sm active:scale-97 transition-transform"
                >
                  Back
                </button>
                <button
                  onClick={handleCompleteOnboarding}
                  disabled={isCompletingOnboarding}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-70 text-white font-semibold px-4 py-3 md:py-2 rounded-xl md:rounded-lg text-sm active:scale-97 transition-colors transition-transform flex items-center justify-center gap-1.5 shadow-sm"
                >
                  {isCompletingOnboarding ? (
                    <>
                      <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Finishing Up…
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" /> Complete Onboarding
                    </>
                  )}
                </button>
              </div>
            </div>
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
                <button
                  onClick={() => setActivePolicy(null)}
                  className="bg-orange-600 hover:bg-orange-700 text-white font-semibold px-4 py-2 rounded-lg text-xs"
                >
                  Close Policy
                </button>
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

  // Approval gate: onboarding stepper is done, but HR/Admin hasn't reviewed
  // the uploaded documents yet. Deliberately only fires for 'pending' or
  // 'rejected' — undefined (employees onboarded before this feature
  // existed) is left alone so nobody already using the app gets locked out.
  if ((role === 'employee' || role === 'team_lead') && profile && profile.onboardingCompleted && (profile.approvalStatus === 'pending' || profile.approvalStatus === 'rejected')) {
    const isRejected = profile.approvalStatus === 'rejected';
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-6 sm:p-8 shadow-sm text-center space-y-4">
          <div className={`h-14 w-14 rounded-full flex items-center justify-center mx-auto ${isRejected ? 'bg-rose-50' : 'bg-amber-50'}`}>
            {isRejected ? (
              <ShieldAlert className="h-7 w-7 text-rose-500" />
            ) : (
              <svg className="animate-spin h-7 w-7 text-amber-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            )}
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              {isRejected ? 'Documents Need Another Look' : 'Almost There — Awaiting HR Approval'}
            </h1>
            <p className="text-sm text-slate-500 mt-2 leading-relaxed">
              {isRejected
                ? 'HR/Admin reviewed your onboarding documents and flagged an issue. Please reach out to HR to sort it out before your dashboard is unlocked.'
                : "You've completed onboarding — thanks! HR/Admin is verifying your documents now. Your dashboard will unlock automatically once you're approved."}
            </p>
          </div>
          {isRejected && profile.approvalRejectionReason && (
            <div className="bg-rose-50 border border-rose-100 text-rose-700 text-xs font-semibold p-3 rounded-lg text-left">
              <span className="font-bold">HR note:</span> {profile.approvalRejectionReason}
            </div>
          )}
          {isRejected && (
            <div className="pt-2 space-y-2">
              <button
                onClick={async () => {
                  if (profile?.id) {
                    await hrActions.updateProfileDetails(profile.id, {
                      onboardingCompleted: false,
                    });
                    window.location.reload();
                  }
                }}
                className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-2.5 rounded-xl text-xs active:scale-97 transition-colors transition-transform shadow-md shadow-orange-600/10"
              >
                Re-submit Documents
              </button>
            </div>
          )}
          <button
            onClick={async () => {
              await hrActions.performLogout(email || '', role);
              clearSession();
              router.push('/auth');
            }}
            className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-xs transition-colors transition-transform active:scale-97"
          >
            Log Out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden relative">
      <NativeBackButtonHandler />
      <Sidebar role={role} />
      {/* min-w-0 here too: this is itself a flex item of the row above
          (alongside Sidebar), and without it a wide descendant (e.g. the
          Careers tab's horizontally-scrollable job-card row) could force
          this whole column wider than the viewport, dragging the entire
          app shell into a page-wide horizontal pan instead of staying
          contained to that one row's own scroll area. overflow-x-hidden
          is a second, explicit guard against the same failure mode. */}
      <div className="flex flex-col flex-1 w-full min-w-0 overflow-hidden overflow-x-hidden">
        <TopNav />
        <main className={`flex-1 w-full min-w-0 overflow-x-hidden ${
          isChatScreen
            ? 'overflow-hidden flex flex-col p-1.5 pb-2.5 md:px-8 md:py-8'
            : isTicketPanelOpen
              // Ticket conversation panel is open — lock the scroll container
              // exactly like the chat screen so the OS keyboard does not try
              // to pan/resize this element (which pushed the fixed panel up).
              ? 'overflow-hidden flex flex-col p-0'
              : isTicketsScreen
                ? 'overflow-y-auto px-4 py-4 pb-2.5 md:px-8 md:py-8'
                : 'overflow-y-auto px-3 py-4 sm:px-4 md:px-8 md:py-8 pb-28 md:pb-8'
        }`}>
          {/* key={pathname} forces PageTransition to remount on every
              nav-tab switch so its animating state (and page-enter) resets
              and re-triggers each time, not just on first load — previously
              content swapped instantly with zero motion. */}
          <PageTransition key={pathname} className={`mx-auto w-full min-w-0 flex flex-col overflow-x-hidden ${isChatScreen ? 'flex-1 h-full max-w-none' : 'max-w-6xl'}`}>
            {children}
          </PageTransition>
        </main>
      </div>

      {/* Blocking "important" announcement popup — employee/team_lead only;
          HR/Admin are the ones posting these, they shouldn't get blocked by
          their own broadcast. See AnnouncementPopup.tsx for why this isn't
          built on the shared <Modal> (must not be dismissible except via its
          own Mark as Read button). */}
      {(role === 'employee' || role === 'team_lead') && (
        <AnnouncementPopup email={email} profile={profile} />
      )}

      {/* Explains a new no-call-no-show / inactivity absence the moment the
          employee it happened to logs in or refreshes — see AbsentPopup.tsx.
          Employee/team_lead only, same reasoning as AnnouncementPopup above:
          HR/Admin aren't the subject of this, they see everyone's absences
          on the dedicated Absent Details page instead. */}
      {(role === 'employee' || role === 'team_lead') && (
        <AbsentPopup email={email} />
      )}

      {/* Blocking System Maintenance Notice popup — see
          MaintenanceNoticePopup.tsx. Unlike AnnouncementPopup/AbsentPopup
          above, this is NOT gated to employee/team_lead only: HR and Admin
          can post these, but they're just as affected by the system going
          down as anyone else, so they see the popup too (no "you posted
          it, you're exempt" exception here). */}
      <MaintenanceNoticePopup email={email} />

      {/* Checks live OS notification permission on every login (not just
          once) and nags until it's turned back on — see
          PushPermissionPrompt.tsx. Applies to every role, not just
          employee/team_lead, since HR/Admin also rely on push for tickets
          and leave requests. */}
      <PushPermissionPrompt />

      {/* Consent Popup Overlay Gate */}
      {showConsent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm fade-enter">
          <div className="bg-white w-full max-w-2xl rounded-xl shadow-2xl p-4 sm:p-8 dialog-enter">
            <div className="text-center pb-4 border-b border-slate-200 mb-6">
              <h2 className="text-xl font-bold text-slate-900">DelCargo HR Consent & Data Agreement</h2>
              <p className="text-xs text-slate-500 mt-1">Please review the terms of data access before continuing.</p>
            </div>
            
            <div className="space-y-4 text-xs text-slate-700 bg-slate-50 p-6 rounded-lg border border-slate-200/50 max-h-[420px] overflow-y-auto leading-relaxed font-medium">
              <p className="text-sm font-semibold text-slate-900">Hello {profile?.fullName || 'Employee'}, welcome to the team {profile?.teams?.join(' and ') || 'Operations'}!</p>
              <p className="font-semibold text-slate-800">Please review the following important HR policies:</p>
              
              <ol className="list-decimal pl-5 space-y-2.5">
                <li>If you're on automatic GPS attendance, this app uses your device's location — including while the app is closed or your screen is locked — solely to detect when you arrive at or leave your assigned warehouse, so your shift can start/end automatically. It is not used to track you outside of that purpose. See our <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-orange-600 underline font-semibold">Privacy Policy</a> for full details on what's collected and why.</li>
                <li>Your first month’s salary will be reserved and can be claimed upon resignation.</li>
                <li>Kindly share your CV, clear front and back images of CNIC along with your bank account details.</li>
                <li>You are entitled to 1 paid time-off (PTO) leave per month.</li>
                <li>PTO requests must be submitted at least 2 weeks in advance.</li>
                <li>For emergency leaves, 2 days’ salary will be deducted for each day of emergency leave. However, if you take no more than 3 emergency leaves in a year, the deducted amount will be reimbursed at year-end.</li>
                <li>
                  Unused PTOs can be:
                  <ul className="list-disc pl-5 mt-1 space-y-1">
                    <li>Accumulated and used together (e.g., for vacations),</li>
                    <li>Rolled over to the next year, or</li>
                    <li>Cashed out at the end of the year.</li>
                  </ul>
                </li>
                <li>An annual anniversary increment will be applied on your work anniversary month (PKR 10,000 for Pakistan-based staff, $100 for USA-based staff).</li>
                <li>Salary details are confidential. Please do not disclose your salary to other employees. If someone asks or insists, report it to HR immediately.</li>
              </ol>

              <div className="pt-4 border-t border-slate-200/60 text-slate-500 font-semibold space-y-0.5">
                <p>If you have any questions or need clarification, feel free to reach out.</p>
                <p className="mt-2">Thank you!</p>
                <p className="text-slate-700">HR Manager</p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end pt-4 border-t border-slate-200">
              <button 
                onClick={handleConsentAccept}
                className="bg-orange-600 hover:bg-orange-700 text-white font-semibold px-5 py-2.5 rounded-lg text-sm active:scale-97 transition-colors transition-transform flex items-center gap-1.5 shadow-sm"
              >
                <CheckCircle2 className="h-4 w-4" /> I Agree & Consent
              </button>
            </div>
          </div>
        </div>
      )}

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
              <button
                onClick={() => setActivePolicy(null)}
                className="bg-orange-600 hover:bg-orange-700 text-white font-semibold px-4 py-2 rounded-lg text-xs"
              >
                Close Policy
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Smart Background Monitor for Inactive Screen Trackers */}
      <SmartInactivityMonitor userRole={role} userEmail={email || ''} />
    </div>
  );
}
