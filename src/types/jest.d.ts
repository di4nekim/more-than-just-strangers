import '@testing-library/jest-dom';

declare global {
  namespace jest {
    interface Matchers<R> {
      toBeInTheDocument(): R;
      toHaveValue(value: string | string[] | number): R;
      toBeVisible(): R;
      toBeDisabled(): R;
      toHaveClass(...classNames: string[]): R;
      toHaveStyle(style: Record<string, any>): R;
      toHaveAttribute(attr: string, value?: string): R;
    }
  }
} 