import axios from 'axios';

import { AppConfigService } from 'src/modules/config/app-config.service';

import { EmailService } from './email.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

interface SendGridBody {
  personalizations: Array<{ to: Array<{ email: string }> }>;
  from: { email: string; name?: string };
  subject: string;
  content: Array<{ type: string; value: string }>;
}

/** The JSON body passed to the Nth axios.post call. */
function postBody(call = 0): SendGridBody {
  return mockedAxios.post.mock.calls[call][1] as SendGridBody;
}

function makeService(cfg: {
  sendgridApiKey?: string;
  emailFrom?: string;
  emailFromName?: string;
}): EmailService {
  return new EmailService(cfg as unknown as AppConfigService);
}

describe('EmailService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('is dormant when unconfigured — returns ok:false and never calls SendGrid', async () => {
    const svc = makeService({});
    expect(svc.isConfigured()).toBe(false);

    const res = await svc.sendToEmails({ to: ['a@b.com', 'c@d.com'], subject: 'Hi' });

    expect(res).toEqual([
      { email: 'a@b.com', ok: false, error: 'email not configured' },
      { email: 'c@d.com', ok: false, error: 'email not configured' },
    ]);
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('returns [] for an empty recipient list without a network call', async () => {
    const svc = makeService({ sendgridApiKey: 'k', emailFrom: 'from@x.co' });
    expect(await svc.sendToEmails({ to: [], subject: 'S' })).toEqual([]);
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('sends one personalization per recipient and marks all ok on a 2xx', async () => {
    mockedAxios.post.mockResolvedValue({ status: 202 });
    const svc = makeService({ sendgridApiKey: 'k', emailFrom: 'from@x.co', emailFromName: 'X' });

    const res = await svc.sendToEmails({
      to: ['a@b.com', 'c@d.com'],
      subject: 'S',
      html: '<p>hi</p>',
    });

    expect(res).toEqual([
      { email: 'a@b.com', ok: true },
      { email: 'c@d.com', ok: true },
    ]);
    expect(mockedAxios.post.mock.calls[0][0]).toBe('https://api.sendgrid.com/v3/mail/send');
    const body = postBody();
    expect(body.personalizations).toHaveLength(2);
    expect(body.personalizations[0].to[0].email).toBe('a@b.com');
    expect(body.personalizations[1].to[0].email).toBe('c@d.com');
    expect(body.from).toEqual({ email: 'from@x.co', name: 'X' });
  });

  it('marks every recipient failed when the transport throws', async () => {
    mockedAxios.isAxiosError.mockReturnValue(false);
    mockedAxios.post.mockRejectedValue(new Error('boom'));
    const svc = makeService({ sendgridApiKey: 'k', emailFrom: 'from@x.co' });

    const res = await svc.sendToEmails({ to: ['a@b.com'], subject: 'S', text: 't' });

    expect(res[0].ok).toBe(false);
    expect(res[0].error).toContain('boom');
  });

  it('falls back to the subject as plain text when no body is given', async () => {
    mockedAxios.post.mockResolvedValue({ status: 202 });
    const svc = makeService({ sendgridApiKey: 'k', emailFrom: 'from@x.co' });

    await svc.sendToEmail({ to: 'a@b.com', subject: 'Just subject' });

    expect(postBody().content).toEqual([{ type: 'text/plain', value: 'Just subject' }]);
  });
});
