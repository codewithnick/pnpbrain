import { Request, Response } from 'express';
import { getBusinessBySlug } from '../lib/business';

export class PublicController {
  public readonly getBusinessBySlug = async (req: Request, res: Response) => {
    const slug = req.params['slug'];
    if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
      return res.status(400).json({ ok: false, error: 'Invalid slug' });
    }

    const business = await getBusinessBySlug(slug);
    if (!business) {
      return res.status(404).json({ ok: false, error: 'Business not found' });
    }

    return res.json({
      ok: true,
      data: {
        id: business.id,
        name: business.name,
        slug: business.slug,
        botName: business.botName,
        welcomeMessage: business.welcomeMessage,
        primaryColor: business.primaryColor,
        widgetPosition: business.widgetPosition,
        widgetTheme: business.widgetTheme,
        showAvatar: business.showAvatar,
      },
    });
  };
}
