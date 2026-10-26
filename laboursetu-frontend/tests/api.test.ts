import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, getApiBaseUrl } from '../src/lib/api';
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe('Independent frontend API communication', () => {
  it('uses the configured backend and includes cookie credentials and CSRF headers', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.example.com/api/v1');
    const fetchMock = vi.fn().mockResolvedValue({ok:true,json:async () => ({success:true,data:{user:{id:'owner'}}})});
    vi.stubGlobal('fetch', fetchMock);
    await api.post('/auth/login', {email:'owner@example.com',password:'test-password'});
    expect(fetchMock).toHaveBeenCalledWith('https://api.example.com/api/v1/auth/login', expect.objectContaining({credentials:'include',method:'POST',headers:expect.objectContaining({'x-requested-with':'XMLHttpRequest'})}));
  });
  it('falls back to the same-origin proxy', () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL','');
    expect(getApiBaseUrl()).toBe('/api/v1');
  });
  it('preserves permission failures for protected requests', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ok:false,status:401,statusText:'Unauthorized',json:async () => ({success:false,error:{code:'UNAUTHORIZED',message:'Login required'}})}));
    await expect(api.get('/auth/me')).rejects.toMatchObject({code:'UNAUTHORIZED',status:401});
  });
  it('preserves filtering and tenant endpoint query parameters', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL','/api/v1');
    const fetchMock = vi.fn().mockResolvedValue({ok:true,json:async () => ({success:true,data:[]})});
    vi.stubGlobal('fetch',fetchMock);
    await api.get('/workers', {search:'Mohan Lal',page:2,empty:''});
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/workers?search=Mohan+Lal&page=2');
  });
});
