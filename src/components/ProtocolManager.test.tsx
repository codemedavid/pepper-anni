import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProtocolManager from './ProtocolManager';
import { allMockProtocols, mockImageProtocol, mockTextProtocol } from '../test/mocks';

const PRODUCT_A = '11111111-1111-1111-1111-111111111111';
const PRODUCT_B = '22222222-2222-2222-2222-222222222222';

const protocolsWithMeta = allMockProtocols.map((p, i) => ({
  ...p,
  version: i + 1,
  product_ids: p.id === mockTextProtocol.id ? [PRODUCT_A] : [],
}));

// Mock useProtocols hook (admin edge API)
const mockAddProtocol = vi.fn().mockResolvedValue({ success: true, data: { id: 'new-proto' } });
const mockUpdateProtocol = vi.fn().mockResolvedValue({ success: true });
const mockDeleteProtocol = vi.fn().mockResolvedValue({ success: true });
const mockToggleActive = vi.fn().mockResolvedValue({ success: true });
const mockSetAssignments = vi.fn().mockResolvedValue({ success: true });
const mockProtocolAdmin = vi.fn();

vi.mock('../hooks/useProtocols', () => ({
  useProtocols: () => ({
    protocols: protocolsWithMeta,
    loading: false,
    addProtocol: mockAddProtocol,
    updateProtocol: mockUpdateProtocol,
    deleteProtocol: mockDeleteProtocol,
    toggleActive: mockToggleActive,
    setAssignments: mockSetAssignments,
  }),
  protocolAdmin: (...args: unknown[]) => mockProtocolAdmin(...args),
}));

vi.mock('../hooks/useMenu', () => ({
  useMenu: () => ({
    products: [
      { id: PRODUCT_A, name: 'Tirzepatide 10mg' },
      { id: PRODUCT_B, name: 'BPC-157 5mg' },
    ],
  }),
}));

// Private bucket upload through a server-issued signed upload URL
const mockUploadToSignedUrl = vi.fn().mockResolvedValue({ data: { path: 'up.pdf' }, error: null });
const mockStorageFrom = vi.fn((_bucket: string) => ({ uploadToSignedUrl: mockUploadToSignedUrl }));
vi.mock('../lib/supabase', () => ({
  supabase: { storage: { from: (bucket: string) => mockStorageFrom(bucket) } },
}));

describe('ProtocolManager', () => {
  const mockOnBack = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockProtocolAdmin.mockImplementation((action: string) => {
      if (action === 'create_upload_url') return Promise.resolve({ path: '123-abc.pdf', token: 'upload-token' });
      if (action === 'get_portal_settings') {
        return Promise.resolve({ has_password: true, password: 'portal-secret-1', updated_at: '2026-11-01T00:00:00Z', session_hours: 720 });
      }
      if (action === 'set_portal_password') return Promise.resolve({ password_version: 2 });
      return Promise.reject(new Error('unexpected ' + action));
    });
  });

  // --- Rendering Tests ---

  describe('rendering', () => {
    it('renders the protocol list', () => {
      render(<ProtocolManager onBack={mockOnBack} />);

      expect(screen.getByText('Tirzepatide')).toBeInTheDocument();
      expect(screen.getByText('GHK-Cu Protocol')).toBeInTheDocument();
      expect(screen.getByText('BPC-157 Protocol')).toBeInTheDocument();
      expect(screen.getByText('Hidden Protocol')).toBeInTheDocument();
    });

    it('shows content type badges for file and image protocols', () => {
      render(<ProtocolManager onBack={mockOnBack} />);

      // These are the badge spans in the protocol list
      const fileBadges = screen.getAllByText('File');
      const imageBadges = screen.getAllByText('Image');
      expect(fileBadges.length).toBeGreaterThanOrEqual(1);
      expect(imageBadges.length).toBeGreaterThanOrEqual(1);
    });

    it('shows dosage info for text protocols', () => {
      render(<ProtocolManager onBack={mockOnBack} />);

      expect(screen.getByText(/2\.5mg - 15mg/)).toBeInTheDocument();
    });

    it('shows "File attached" for file protocols', () => {
      render(<ProtocolManager onBack={mockOnBack} />);

      expect(screen.getByText('File attached')).toBeInTheDocument();
    });

    it('shows "Image attached" for image protocols', () => {
      render(<ProtocolManager onBack={mockOnBack} />);

      expect(screen.getByText('Image attached')).toBeInTheDocument();
    });

    it('shows Draft badge for inactive and Active badge for published protocols', () => {
      render(<ProtocolManager onBack={mockOnBack} />);

      expect(screen.getAllByText('Draft')).toHaveLength(1);
      expect(screen.getAllByText('Active')).toHaveLength(3);
    });

    it('shows the version number on each protocol', () => {
      render(<ProtocolManager onBack={mockOnBack} />);

      expect(screen.getByText('v1')).toBeInTheDocument();
      expect(screen.getByText('v4')).toBeInTheDocument();
    });

    it('shows assigned product names', () => {
      render(<ProtocolManager onBack={mockOnBack} />);

      expect(screen.getByText('Tirzepatide 10mg')).toBeInTheDocument();
      expect(screen.getAllByText('Not assigned to a product')).toHaveLength(3);
    });

    it('shows Add Protocol button', () => {
      render(<ProtocolManager onBack={mockOnBack} />);

      expect(screen.getByText('Add Protocol')).toBeInTheDocument();
    });
  });

  // --- Add Protocol Form Tests ---

  describe('add protocol form', () => {
    it('opens add form when clicking Add Protocol', async () => {
      render(<ProtocolManager onBack={mockOnBack} />);

      await userEvent.click(screen.getByText('Add Protocol'));

      expect(screen.getByText(/Add New Protocol/)).toBeInTheDocument();
    });

    it('shows content type selector with Text, File, Image buttons', async () => {
      render(<ProtocolManager onBack={mockOnBack} />);

      await userEvent.click(screen.getByText('Add Protocol'));

      expect(screen.getByText('Protocol Content Type *')).toBeInTheDocument();
      expect(screen.getByText('Text')).toBeInTheDocument();
    });

    it('shows text fields by default (text content type)', async () => {
      render(<ProtocolManager onBack={mockOnBack} />);

      await userEvent.click(screen.getByText('Add Protocol'));

      expect(screen.getByPlaceholderText('e.g., 2.5mg - 15mg')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('e.g., Once weekly')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('e.g., 12-16 weeks')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('e.g., Refrigerate at 2-8°C')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Enter each note on a new line...')).toBeInTheDocument();
    });

    it('shows file upload area when File content type is selected', async () => {
      render(<ProtocolManager onBack={mockOnBack} />);

      await userEvent.click(screen.getByText('Add Protocol'));

      // Find the content type File button (has border-2 class)
      const fileButtons = screen.getAllByText('File');
      const fileTypeButton = fileButtons.find(el => el.closest('button')?.className.includes('border-2'));
      expect(fileTypeButton).toBeDefined();
      await userEvent.click(fileTypeButton!);

      expect(screen.getByText('Click to upload a file')).toBeInTheDocument();
      expect(screen.getByText('PDF, DOC, DOCX, TXT, XLS, XLSX')).toBeInTheDocument();
    });

    it('shows image upload area when Image content type is selected', async () => {
      render(<ProtocolManager onBack={mockOnBack} />);

      await userEvent.click(screen.getByText('Add Protocol'));

      const imageButtons = screen.getAllByText('Image');
      const imageTypeButton = imageButtons.find(el => el.closest('button')?.className.includes('border-2'));
      expect(imageTypeButton).toBeDefined();
      await userEvent.click(imageTypeButton!);

      expect(screen.getByText('Click to upload an image')).toBeInTheDocument();
      expect(screen.getByText('JPG, PNG, WebP, GIF, etc.')).toBeInTheDocument();
    });

    it('hides text fields when switching to file content type', async () => {
      render(<ProtocolManager onBack={mockOnBack} />);

      await userEvent.click(screen.getByText('Add Protocol'));

      expect(screen.getByPlaceholderText('e.g., 2.5mg - 15mg')).toBeInTheDocument();

      const fileButtons = screen.getAllByText('File');
      const fileTypeButton = fileButtons.find(el => el.closest('button')?.className.includes('border-2'));
      await userEvent.click(fileTypeButton!);

      expect(screen.queryByPlaceholderText('e.g., 2.5mg - 15mg')).not.toBeInTheDocument();
      expect(screen.queryByPlaceholderText('e.g., Once weekly')).not.toBeInTheDocument();
      expect(screen.queryByPlaceholderText('Enter each note on a new line...')).not.toBeInTheDocument();
    });

    it('switches back to text fields when selecting Text content type', async () => {
      render(<ProtocolManager onBack={mockOnBack} />);

      await userEvent.click(screen.getByText('Add Protocol'));

      const fileButtons = screen.getAllByText('File');
      const fileTypeButton = fileButtons.find(el => el.closest('button')?.className.includes('border-2'));
      await userEvent.click(fileTypeButton!);

      expect(screen.queryByPlaceholderText('e.g., 2.5mg - 15mg')).not.toBeInTheDocument();

      await userEvent.click(screen.getByText('Text'));

      expect(screen.getByPlaceholderText('e.g., 2.5mg - 15mg')).toBeInTheDocument();
    });
  });

  // --- Save Protocol Tests ---

  describe('saving protocols', () => {
    it('saves a text protocol with all fields', async () => {
      render(<ProtocolManager onBack={mockOnBack} />);

      await userEvent.click(screen.getByText('Add Protocol'));

      await userEvent.type(screen.getByPlaceholderText('e.g., Tirzepatide'), 'Test Protocol');
      await userEvent.type(screen.getByPlaceholderText('e.g., Weight Management'), 'Test Category');
      await userEvent.type(screen.getByPlaceholderText('e.g., 2.5mg - 15mg'), '5mg');

      await userEvent.click(screen.getByText('Save Protocol'));

      await waitFor(() => {
        expect(mockAddProtocol).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Test Protocol',
            category: 'Test Category',
            dosage: '5mg',
            content_type: 'text',
            file_url: null,
          })
        );
      });
    });

    it('validates name and category are required', async () => {
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

      render(<ProtocolManager onBack={mockOnBack} />);

      await userEvent.click(screen.getByText('Add Protocol'));
      await userEvent.click(screen.getByText('Save Protocol'));

      expect(alertSpy).toHaveBeenCalledWith('Please fill in name and category');
      expect(mockAddProtocol).not.toHaveBeenCalled();

      alertSpy.mockRestore();
    });

    it('validates dosage is required for text content type', async () => {
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

      render(<ProtocolManager onBack={mockOnBack} />);

      await userEvent.click(screen.getByText('Add Protocol'));

      await userEvent.type(screen.getByPlaceholderText('e.g., Tirzepatide'), 'Test');
      await userEvent.type(screen.getByPlaceholderText('e.g., Weight Management'), 'Cat');

      await userEvent.click(screen.getByText('Save Protocol'));

      expect(alertSpy).toHaveBeenCalledWith('Please fill in dosage for text protocols');
      expect(mockAddProtocol).not.toHaveBeenCalled();

      alertSpy.mockRestore();
    });

    it('validates file is required for file content type', async () => {
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

      render(<ProtocolManager onBack={mockOnBack} />);

      await userEvent.click(screen.getByText('Add Protocol'));

      await userEvent.type(screen.getByPlaceholderText('e.g., Tirzepatide'), 'Test');
      await userEvent.type(screen.getByPlaceholderText('e.g., Weight Management'), 'Cat');

      const fileButtons = screen.getAllByText('File');
      const fileTypeButton = fileButtons.find(el => el.closest('button')?.className.includes('border-2'));
      await userEvent.click(fileTypeButton!);

      await userEvent.click(screen.getByText('Save Protocol'));

      expect(alertSpy).toHaveBeenCalledWith('Please upload a file');
      expect(mockAddProtocol).not.toHaveBeenCalled();

      alertSpy.mockRestore();
    });

    it('validates image is required for image content type', async () => {
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

      render(<ProtocolManager onBack={mockOnBack} />);

      await userEvent.click(screen.getByText('Add Protocol'));

      await userEvent.type(screen.getByPlaceholderText('e.g., Tirzepatide'), 'Test');
      await userEvent.type(screen.getByPlaceholderText('e.g., Weight Management'), 'Cat');

      const imageButtons = screen.getAllByText('Image');
      const imageTypeButton = imageButtons.find(el => el.closest('button')?.className.includes('border-2'));
      await userEvent.click(imageTypeButton!);

      await userEvent.click(screen.getByText('Save Protocol'));

      expect(alertSpy).toHaveBeenCalledWith('Please upload a image');
      expect(mockAddProtocol).not.toHaveBeenCalled();

      alertSpy.mockRestore();
    });
  });

  // --- Edit Protocol Tests ---

  describe('editing protocols', () => {
    it('populates form with protocol data when editing a text protocol', async () => {
      render(<ProtocolManager onBack={mockOnBack} />);

      const editButtons = screen.getAllByTitle('Edit');
      await userEvent.click(editButtons[0]); // Edit Tirzepatide (text)

      expect(screen.getByDisplayValue('Tirzepatide')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Weight Management')).toBeInTheDocument();
      expect(screen.getByDisplayValue('2.5mg - 15mg')).toBeInTheDocument();
    });

    it('populates form with image content type when editing an image protocol', async () => {
      render(<ProtocolManager onBack={mockOnBack} />);

      const editButtons = screen.getAllByTitle('Edit');
      await userEvent.click(editButtons[1]); // Edit GHK-Cu Protocol (image)

      expect(screen.getByDisplayValue('GHK-Cu Protocol')).toBeInTheDocument();
      // Should show image preview since file_url exists
      const imgs = screen.getAllByAltText('Protocol preview');
      expect(imgs.length).toBeGreaterThanOrEqual(1);
      expect(imgs[0]).toHaveAttribute('src', mockImageProtocol.file_url);
    });

    it('populates form with file content type when editing a file protocol', async () => {
      render(<ProtocolManager onBack={mockOnBack} />);

      const editButtons = screen.getAllByTitle('Edit');
      await userEvent.click(editButtons[2]); // Edit BPC-157 Protocol (file)

      expect(screen.getByDisplayValue('BPC-157 Protocol')).toBeInTheDocument();
      expect(screen.getByText('File already uploaded')).toBeInTheDocument();
      expect(screen.getByText('View current file')).toBeInTheDocument();
    });
  });

  // --- Uploads & assignments ---

  describe('private uploads and product assignment', () => {
    it('uploads a file through a signed upload URL and saves file_path', async () => {
      render(<ProtocolManager onBack={mockOnBack} />);

      await userEvent.click(screen.getByText('Add Protocol'));
      await userEvent.type(screen.getByPlaceholderText('e.g., Tirzepatide'), 'PDF Protocol');
      await userEvent.type(screen.getByPlaceholderText('e.g., Weight Management'), 'Docs');

      const fileButtons = screen.getAllByText('File');
      const fileTypeButton = fileButtons.find(el => el.closest('button')?.className.includes('border-2'));
      await userEvent.click(fileTypeButton!);

      const file = new File(['%PDF-1.4 test content'], 'guide.pdf', { type: 'application/pdf' });
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      await userEvent.upload(input, file);

      await userEvent.click(screen.getByText('Save Protocol'));

      await waitFor(() => expect(mockAddProtocol).toHaveBeenCalled());
      expect(mockProtocolAdmin).toHaveBeenCalledWith('create_upload_url', { filename: 'guide.pdf', content_type: 'application/pdf' });
      expect(mockStorageFrom).toHaveBeenCalledWith('protocol-files');
      expect(mockUploadToSignedUrl).toHaveBeenCalledWith('123-abc.pdf', 'upload-token', file, { contentType: 'application/pdf' });
      expect(mockAddProtocol).toHaveBeenCalledWith(expect.objectContaining({
        content_type: 'file', file_path: '123-abc.pdf', file_url: null,
      }));
    });

    it('assigns products to a new protocol', async () => {
      render(<ProtocolManager onBack={mockOnBack} />);

      await userEvent.click(screen.getByText('Add Protocol'));
      await userEvent.type(screen.getByPlaceholderText('e.g., Tirzepatide'), 'Stack');
      await userEvent.type(screen.getByPlaceholderText('e.g., Weight Management'), 'Cat');
      await userEvent.type(screen.getByPlaceholderText('e.g., 2.5mg - 15mg'), '1mg');

      const group = screen.getByRole('group', { name: 'Assigned products' });
      await userEvent.click(within(group).getByLabelText('BPC-157 5mg'));

      await userEvent.click(screen.getByText('Save Protocol'));

      await waitFor(() => expect(mockSetAssignments).toHaveBeenCalledWith('new-proto', [PRODUCT_B]));
    });

    it('pre-selects and updates assignments when editing', async () => {
      render(<ProtocolManager onBack={mockOnBack} />);

      await userEvent.click(screen.getAllByTitle('Edit')[0]); // Tirzepatide, assigned to PRODUCT_A
      const group = screen.getByRole('group', { name: 'Assigned products' });
      expect(within(group).getByLabelText('Tirzepatide 10mg')).toBeChecked();

      await userEvent.click(within(group).getByLabelText('BPC-157 5mg'));
      await userEvent.click(screen.getByText('Save Protocol'));

      await waitFor(() => expect(mockSetAssignments).toHaveBeenCalledWith('proto-1', [PRODUCT_A, PRODUCT_B]));
      expect(mockUpdateProtocol).toHaveBeenCalledWith('proto-1', expect.objectContaining({ name: 'Tirzepatide' }));
    });

    it('does not re-save assignments when they did not change', async () => {
      render(<ProtocolManager onBack={mockOnBack} />);

      await userEvent.click(screen.getAllByTitle('Edit')[0]);
      await userEvent.click(screen.getByText('Save Protocol'));

      await waitFor(() => expect(mockUpdateProtocol).toHaveBeenCalled());
      expect(mockSetAssignments).not.toHaveBeenCalled();
    });
  });

  // --- Portal password settings ---

  describe('portal password settings', () => {
    it('shows the current password hidden by default and reveals it', async () => {
      render(<ProtocolManager onBack={mockOnBack} />);

      await userEvent.click(screen.getByRole('button', { name: /Settings/ }));

      const pw = await screen.findByTestId('current-portal-password');
      expect(pw).not.toHaveTextContent('portal-secret-1');

      await userEvent.click(screen.getByRole('button', { name: 'Show current password' }));
      expect(pw).toHaveTextContent('portal-secret-1');
    });

    it('validates minimum length and confirmation', async () => {
      render(<ProtocolManager onBack={mockOnBack} />);
      await userEvent.click(screen.getByRole('button', { name: /Settings/ }));
      await screen.findByTestId('current-portal-password');

      await userEvent.type(screen.getByLabelText('New password'), 'short');
      await userEvent.type(screen.getByLabelText('Confirm password'), 'short');
      await userEvent.click(screen.getByText('Save portal password'));
      expect(screen.getByRole('alert')).toHaveTextContent('at least 8 characters');

      await userEvent.clear(screen.getByLabelText('New password'));
      await userEvent.type(screen.getByLabelText('New password'), 'longenough1');
      await userEvent.click(screen.getByText('Save portal password'));
      expect(screen.getByRole('alert')).toHaveTextContent('do not match');
      expect(mockProtocolAdmin).not.toHaveBeenCalledWith('set_portal_password', expect.anything());
    });

    it('warns and saves a new portal password', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      render(<ProtocolManager onBack={mockOnBack} />);
      await userEvent.click(screen.getByRole('button', { name: /Settings/ }));
      await screen.findByTestId('current-portal-password');

      expect(screen.getByText(/logs everyone out of the protocol portal/)).toBeInTheDocument();

      await userEvent.type(screen.getByLabelText('New password'), 'new-portal-pass');
      await userEvent.type(screen.getByLabelText('Confirm password'), 'new-portal-pass');
      await userEvent.click(screen.getByText('Save portal password'));

      await waitFor(() =>
        expect(mockProtocolAdmin).toHaveBeenCalledWith('set_portal_password', { password: 'new-portal-pass' }),
      );
      expect(confirmSpy).toHaveBeenCalled();
      expect(await screen.findByText(/Portal password saved/)).toBeInTheDocument();
      confirmSpy.mockRestore();
    });
  });

  // --- Delete & Toggle Tests ---

  describe('delete and toggle', () => {
    it('calls deleteProtocol when delete is confirmed', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);

      render(<ProtocolManager onBack={mockOnBack} />);

      const deleteButtons = screen.getAllByTitle('Delete');
      await userEvent.click(deleteButtons[0]);

      await waitFor(() => {
        expect(mockDeleteProtocol).toHaveBeenCalledWith('proto-1');
      });
    });

    it('does not delete when confirm is cancelled', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);

      render(<ProtocolManager onBack={mockOnBack} />);

      const deleteButtons = screen.getAllByTitle('Delete');
      await userEvent.click(deleteButtons[0]);

      expect(mockDeleteProtocol).not.toHaveBeenCalled();
    });

    it('toggles active state on first active protocol', async () => {
      render(<ProtocolManager onBack={mockOnBack} />);

      const hideButtons = screen.getAllByTitle('Hide from website');
      await userEvent.click(hideButtons[0]);

      await waitFor(() => {
        expect(mockToggleActive).toHaveBeenCalled();
      });
    });
  });

  // --- Cancel Tests ---

  describe('cancel', () => {
    it('closes form when Cancel is clicked', async () => {
      render(<ProtocolManager onBack={mockOnBack} />);

      await userEvent.click(screen.getByText('Add Protocol'));
      expect(screen.getByText(/Add New Protocol/)).toBeInTheDocument();

      await userEvent.click(screen.getByText('Cancel'));
      expect(screen.queryByText(/Add New Protocol/)).not.toBeInTheDocument();
    });
  });

  // --- Back Button ---

  describe('navigation', () => {
    it('calls onBack when back button is clicked', async () => {
      render(<ProtocolManager onBack={mockOnBack} />);

      const buttons = screen.getAllByRole('button');
      await userEvent.click(buttons[0]); // First button is the back arrow

      expect(mockOnBack).toHaveBeenCalled();
    });
  });
});
