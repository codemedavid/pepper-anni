import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Footer from './Footer';

describe('Footer', () => {
  it('shows Pepperanni2026@gmail.com as the contact email', () => {
    render(<Footer />);

    const emailLink = screen.getByRole('link', { name: /Pepperanni2026@gmail\.com/i });
    expect(emailLink).toHaveAttribute('href', 'mailto:Pepperanni2026@gmail.com');
  });

  it('does not render the physical location', () => {
    render(<Footer />);

    expect(screen.queryByText(/General Trias, Cavite/i)).not.toBeInTheDocument();
  });

  it('still shows the phone number', () => {
    render(<Footer />);

    expect(screen.getByText(/0947 506 7148/)).toBeInTheDocument();
  });
});
