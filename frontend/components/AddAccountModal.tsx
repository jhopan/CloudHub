import React, { useState, useEffect, useCallback } from 'react';
import { X, Loader2, Copy, Check, AlertCircle, ExternalLink, ArrowRight } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useEscapeKey } from '@/lib/use-escape-key';
import { useToast } from '@/lib/toast-context';

interface Provider {
  id: string;
  name: string;
  type: string;
  display_name: string;
  icon_url: string;
  auth_type: string;
  config_schema: string;
}

interface AddAccountModalProps {
  provider: Provider;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddAccountModal({ provider, onClose, onSuccess }: AddAccountModalProps) {
  const handleEscape = useCallback(() => onClose(), [onClose]);
  useEscapeKey(handleEscape);
  const { success: toastSuccess } = useToast();

  const [step, setStep] = useState<'form' | 'oauth-wait' | 'success' | 'error'>('form');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Form fields
  const [label, setLabel] = useState('');
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  
  // OAuth state
  const [oauthSession, setOauthSession] = useState<string | null>(null);
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [callbackProxyUrl, setCallbackProxyUrl] = useState<string | null>(null);
  const [callbackUrl, setCallbackUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [copiedAuth, setCopiedAuth] = useState(false);

  // Parse config schema to get required fields
  const getRequiredFields = (): Array<{ name: string; label: string; type: string; placeholder?: string }> => {
    const authType = provider.auth_type.toLowerCase();
    
    // OAuth providers (Google Drive, OneDrive, Dropbox)
    if (authType === 'oauth' || authType === 'oauth2') {
      return [];
    }
    
    // Credentials-based providers
    if (provider.type === 'mega') {
      return [
        { name: 'user', label: 'Email', type: 'email', placeholder: 'you@example.com' },
        { name: 'pass', label: 'Password', type: 'password', placeholder: 'Your Mega password' },
      ];
    }
    
    if (provider.type === 'onedrive') {
      return [];
    }
    
    if (provider.type === 'dropbox') {
      return [];
    }
    
    // S3-compatible (Cloudflare R2, Backblaze B2, etc)
    if (provider.type === 'r2' || provider.type === 's3') {
      return [
        { name: 'access_key_id', label: 'Access Key ID', type: 'text', placeholder: 'Your access key' },
        { name: 'secret_access_key', label: 'Secret Access Key', type: 'password', placeholder: 'Your secret key' },
        { name: 'endpoint', label: 'Endpoint URL', type: 'url', placeholder: 'https://...' },
        { name: 'bucket', label: 'Bucket Name', type: 'text', placeholder: 'my-bucket' },
      ];
    }
    
    if (provider.type === 'b2') {
      return [
        { name: 'account', label: 'Account ID', type: 'text', placeholder: 'Your B2 account ID' },
        { name: 'key', label: 'Application Key', type: 'password', placeholder: 'Your application key' },
      ];
    }
    
    // WebDAV / Nextcloud
    if (provider.type === 'webdav') {
      return [
        { name: 'url', label: 'URL', type: 'url', placeholder: 'https://your-server.com/webdav' },
        { name: 'user', label: 'Username', type: 'text', placeholder: 'username' },
        { name: 'pass', label: 'Password', type: 'password', placeholder: 'password' },
      ];
    }
    
    return [];
  };

  const requiredFields = getRequiredFields();
  const isOAuth = provider.auth_type.toLowerCase() === 'oauth' || provider.auth_type.toLowerCase() === 'oauth2';

  // OAuth flow
  const handleOAuthSubmit = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const res = await apiClient.get('/oauth/google/initiate', {
        params: {
          provider: provider.type,
          label: label || `${provider.display_name} Account`,
        },
      });
      
      setOauthSession(res.data.session_id);
      setAuthUrl(res.data.auth_url);
      setCallbackProxyUrl(res.data.callback_proxy_url || null);
      setStep('oauth-wait');
      
      // Start polling
      pollOAuthStatus(res.data.session_id);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to start OAuth');
      setStep('error');
    } finally {
      setLoading(false);
    }
  };

  const pollOAuthStatus = async (sessionId: string) => {
    const maxAttempts = 60; // 5 minutes
    let attempts = 0;
    
    const poll = async () => {
      try {
        const res = await apiClient.get('/oauth/status', {
          params: { session_id: sessionId },
        });
        
        // Backend returns: { done: bool, success: bool, error?: string }
        if (res.data.done && res.data.success) {
          setStep('success');
          toastSuccess(`${provider.display_name} account connected successfully!`);
          setTimeout(() => {
            onSuccess();
            onClose();
          }, 1500);
          return;
        }
        
        if (res.data.done && !res.data.success) {
          setError(res.data.error || 'OAuth failed');
          setStep('error');
          return;
        }
        
        // Still pending - continue polling
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(poll, 3000);
        } else {
          setError('OAuth timeout - please try again');
          setStep('error');
        }
      } catch (err: any) {
        if (err.response?.status === 404) {
          // Session not found or expired - this is an error, NOT success
          setError('OAuth session expired. Please try again.');
          setStep('error');
        } else {
          // Retry on other errors
          attempts++;
          if (attempts < maxAttempts) {
            setTimeout(poll, 3000);
          } else {
            setError('Failed to check OAuth status');
            setStep('error');
          }
        }
      }
    };
    
    setTimeout(poll, 3000);
  };

  const handleManualCallback = async () => {
    if (!oauthSession || !callbackUrl) return;
    
    setLoading(true);
    try {
      await apiClient.post('/oauth/callback', {
        session_id: oauthSession,
        callback_url: callbackUrl,
      });
      
      setStep('success');
      toastSuccess(`${provider.display_name} account connected successfully!`);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Invalid callback URL');
    } finally {
      setLoading(false);
    }
  };

  // Credentials flow
  const handleCredentialsSubmit = async () => {
    setLoading(true);
    setError(null);
    
    try {
      await apiClient.post('/storage-accounts', {
        provider_id: provider.id,
        name: label || `${provider.display_name} Account`,
        credentials,
      });
      
      setStep('success');
      toastSuccess(`${provider.display_name} account connected successfully!`);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to add account');
      setStep('error');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyAuthUrl = () => {
    if (authUrl) {
      navigator.clipboard.writeText(authUrl);
      setCopiedAuth(true);
      setTimeout(() => setCopiedAuth(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-backdrop p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto animate-scale-in">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            {provider.icon_url && (
              <img src={provider.icon_url} alt={provider.display_name} className="w-8 h-8" />
            )}
            <h2 className="text-xl font-semibold text-gray-900">
              Add {provider.display_name} Account
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          
          {/* Form Step */}
          {step === 'form' && (
            <div className="space-y-4">
              {/* Label field (always shown) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Account Label
                </label>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder={`My ${provider.display_name} Account`}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>

              {/* Dynamic fields for credentials */}
              {!isOAuth && requiredFields.map(field => (
                <div key={field.name}>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {field.label}
                  </label>
                  <input
                    type={field.type}
                    value={credentials[field.name] || ''}
                    onChange={(e) => setCredentials(prev => ({
                      ...prev,
                      [field.name]: e.target.value,
                    }))}
                    placeholder={field.placeholder}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
              ))}

              {/* Submit button */}
              <button
                onClick={isOAuth ? handleOAuthSubmit : handleCredentialsSubmit}
                disabled={loading || (!isOAuth && requiredFields.some(f => !credentials[f.name]))}
                className="w-full py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {isOAuth ? 'Starting OAuth...' : 'Adding Account...'}
                  </>
                ) : (
                  isOAuth ? 'Continue with OAuth' : 'Add Account'
                )}
              </button>
            </div>
          )}

          {/* OAuth Wait Step */}
          {step === 'oauth-wait' && authUrl && (
            <div className="space-y-4">
              {/* Step 1: Open auth URL */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="flex items-center justify-center w-6 h-6 bg-blue-600 text-white text-xs font-bold rounded-full">1</span>
                  <p className="text-sm text-blue-900 font-medium">
                    Open the authorization link
                  </p>
                </div>
                <p className="text-xs text-blue-700 mb-3 ml-8">
                  Copy this URL and open it in a new browser tab:
                </p>
                <div className="flex items-center gap-2 ml-8">
                  <input
                    type="text"
                    value={authUrl}
                    readOnly
                    className="flex-1 px-3 py-2 bg-white border border-blue-300 rounded-lg text-xs font-mono"
                  />
                  <button
                    onClick={copyAuthUrl}
                    className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    title="Copy URL"
                  >
                    {copiedAuth ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Step 2: Sign in with Google */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="flex items-center justify-center w-6 h-6 bg-gray-600 text-white text-xs font-bold rounded-full">2</span>
                  <p className="text-sm text-gray-900 font-medium">
                    Sign in with Google
                  </p>
                </div>
                <p className="text-xs text-gray-600 ml-8">
                  Grant permission to access your {provider.display_name} account
                </p>
              </div>

              {/* Step 3: Handle the "can't be reached" page */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="flex items-center justify-center w-6 h-6 bg-amber-600 text-white text-xs font-bold rounded-full">3</span>
                  <p className="text-sm text-amber-900 font-medium">
                    Copy the error page URL
                  </p>
                </div>
                <p className="text-xs text-amber-700 ml-8 mb-2">
                  After signing in, your browser will show <strong>"This site can't be reached"</strong>. This is normal!
                </p>
                <p className="text-xs text-amber-700 ml-8">
                  Copy the <strong>entire URL</strong> from the address bar (Ctrl+A, Ctrl+C)
                </p>
              </div>

              {/* Step 4: Submit the callback */}
              {callbackProxyUrl ? (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="flex items-center justify-center w-6 h-6 bg-green-600 text-white text-xs font-bold rounded-full">4</span>
                    <p className="text-sm text-green-900 font-medium">
                      Complete authorization
                    </p>
                  </div>
                  <p className="text-xs text-green-700 ml-8 mb-3">
                    Open this page and paste the URL you copied:
                  </p>
                  <a
                    href={callbackProxyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 ml-8 px-4 py-3 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Open Callback Page
                    <ArrowRight className="w-4 h-4" />
                  </a>
                </div>
              ) : (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="flex items-center justify-center w-6 h-6 bg-green-600 text-white text-xs font-bold rounded-full">4</span>
                    <p className="text-sm text-green-900 font-medium">
                      Paste the callback URL below
                    </p>
                  </div>
                  <div className="flex gap-2 ml-8">
                    <input
                      type="text"
                      value={callbackUrl}
                      onChange={(e) => setCallbackUrl(e.target.value)}
                      placeholder="http://127.0.0.1:53682/auth?state=...&code=..."
                      className="flex-1 px-3 py-2 border border-green-300 rounded-lg text-sm"
                    />
                    <button
                      onClick={handleManualCallback}
                      disabled={!callbackUrl || loading}
                      className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                    >
                      Submit
                    </button>
                  </div>
                </div>
              )}

              {/* Polling status */}
              <div className="text-center py-3 border-t border-gray-200">
                <Loader2 className="w-5 h-5 animate-spin text-blue-600 mx-auto mb-2" />
                <p className="text-xs text-gray-500">Waiting for authorization...</p>
              </div>

              {/* Manual paste fallback (always available when callback_proxy_url exists) */}
              {callbackProxyUrl && (
                <details className="border-t border-gray-200 pt-3">
                  <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
                    Or paste the callback URL here manually
                  </summary>
                  <div className="flex gap-2 mt-3">
                    <input
                      type="text"
                      value={callbackUrl}
                      onChange={(e) => setCallbackUrl(e.target.value)}
                      placeholder="http://127.0.0.1:53682/auth?state=...&code=..."
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                    <button
                      onClick={handleManualCallback}
                      disabled={!callbackUrl || loading}
                      className="px-4 py-2 bg-gray-600 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                    >
                      Submit
                    </button>
                  </div>
                </details>
              )}
            </div>
          )}

          {/* Success Step */}
          {step === 'success' && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Account Added!</h3>
              <p className="text-sm text-gray-600">
                Your {provider.display_name} account has been connected successfully.
              </p>
            </div>
          )}

          {/* Error Step */}
          {step === 'error' && error && (
            <div className="space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-900 mb-1">Error</p>
                  <p className="text-xs text-red-700">{error}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setStep('form');
                  setError(null);
                  setOauthSession(null);
                  setAuthUrl(null);
                  setCallbackProxyUrl(null);
                }}
                className="w-full py-2.5 bg-gray-600 text-white font-medium rounded-lg hover:bg-gray-700 transition-colors"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
