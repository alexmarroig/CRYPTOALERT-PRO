import { Router } from 'express';
import {
  createSupportTicket,
  listMySupportTickets,
  listSupportTicketsAdmin,
  updateSupportTicketAdmin
} from '../../controllers/supportController.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/roleCheck.js';
import { supportRateLimit } from '../../middleware/rateLimit.js';

export const supportRoutes = Router();

supportRoutes.post('/support/tickets', supportRateLimit, requireAuth, createSupportTicket);
supportRoutes.get('/support/tickets/mine', supportRateLimit, requireAuth, listMySupportTickets);
supportRoutes.get('/admin/support/tickets', supportRateLimit, requireAuth, requireRole('admin'), listSupportTicketsAdmin);
supportRoutes.patch('/admin/support/tickets/:id', supportRateLimit, requireAuth, requireRole('admin'), updateSupportTicketAdmin);
