import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/Card'

describe('Card', () => {
  describe('rendering', () => {
    it('renders children', () => {
      render(<Card>Card content</Card>)
      expect(screen.getByText('Card content')).toBeInTheDocument()
    })

    it('applies rounded-lg class', () => {
      const { container } = render(<Card>Content</Card>)
      expect(container.firstChild).toHaveClass('rounded-lg')
    })
  })

  describe('variants', () => {
    it('renders default variant', () => {
      const { container } = render(<Card variant="default">Default</Card>)
      expect(container.firstChild).toHaveClass('bg-background')
    })

    it('renders bordered variant', () => {
      const { container } = render(<Card variant="bordered">Bordered</Card>)
      expect(container.firstChild).toHaveClass('bg-background', 'border', 'border-border')
    })

    it('renders elevated variant', () => {
      const { container } = render(<Card variant="elevated">Elevated</Card>)
      expect(container.firstChild).toHaveClass('bg-background', 'shadow-lg')
    })
  })

  describe('padding', () => {
    it('renders no padding', () => {
      const { container } = render(<Card padding="none">No padding</Card>)
      expect(container.firstChild).not.toHaveClass('p-4', 'p-6', 'p-8')
    })

    it('renders small padding', () => {
      const { container } = render(<Card padding="sm">Small</Card>)
      expect(container.firstChild).toHaveClass('p-4')
    })

    it('renders medium padding (default)', () => {
      const { container } = render(<Card padding="md">Medium</Card>)
      expect(container.firstChild).toHaveClass('p-6')
    })

    it('renders large padding', () => {
      const { container } = render(<Card padding="lg">Large</Card>)
      expect(container.firstChild).toHaveClass('p-8')
    })
  })

  describe('hover', () => {
    it('applies hover styles when hover is true', () => {
      const { container } = render(<Card hover>Hoverable</Card>)
      expect(container.firstChild).toHaveClass('hover:shadow-lg', 'cursor-pointer')
    })

    it('does not apply hover styles by default', () => {
      const { container } = render(<Card>Not hoverable</Card>)
      expect(container.firstChild).not.toHaveClass('hover:shadow-lg', 'cursor-pointer')
    })
  })

  describe('custom className', () => {
    it('accepts custom className', () => {
      const { container } = render(<Card className="custom-card">Custom</Card>)
      expect(container.firstChild).toHaveClass('custom-card')
    })
  })
})

describe('CardHeader', () => {
  it('renders children', () => {
    render(<CardHeader>Header content</CardHeader>)
    expect(screen.getByText('Header content')).toBeInTheDocument()
  })

  it('applies margin-bottom', () => {
    const { container } = render(<CardHeader>Header</CardHeader>)
    expect(container.firstChild).toHaveClass('mb-4')
  })

  it('accepts custom className', () => {
    const { container } = render(<CardHeader className="custom-header">Header</CardHeader>)
    expect(container.firstChild).toHaveClass('custom-header')
  })
})

describe('CardTitle', () => {
  it('renders children', () => {
    render(<CardTitle>Title text</CardTitle>)
    expect(screen.getByText('Title text')).toBeInTheDocument()
  })

  it('defaults to h3', () => {
    render(<CardTitle>Title</CardTitle>)
    expect(screen.getByRole('heading', { level: 3 })).toBeInTheDocument()
  })

  it('can render as h1', () => {
    render(<CardTitle as="h1">H1 Title</CardTitle>)
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })

  it('can render as h2', () => {
    render(<CardTitle as="h2">H2 Title</CardTitle>)
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument()
  })

  it('applies styling classes', () => {
    render(<CardTitle>Styled</CardTitle>)
    expect(screen.getByText('Styled')).toHaveClass('text-lg', 'font-semibold')
  })

  it('accepts custom className', () => {
    render(<CardTitle className="custom-title">Title</CardTitle>)
    expect(screen.getByText('Title')).toHaveClass('custom-title')
  })
})

describe('CardDescription', () => {
  it('renders children', () => {
    render(<CardDescription>Description text</CardDescription>)
    expect(screen.getByText('Description text')).toBeInTheDocument()
  })

  it('applies styling classes', () => {
    render(<CardDescription>Description</CardDescription>)
    expect(screen.getByText('Description')).toHaveClass('text-sm', 'text-muted-foreground')
  })

  it('renders as paragraph', () => {
    const { container } = render(<CardDescription>Desc</CardDescription>)
    expect(container.querySelector('p')).toBeInTheDocument()
  })

  it('accepts custom className', () => {
    render(<CardDescription className="custom-desc">Desc</CardDescription>)
    expect(screen.getByText('Desc')).toHaveClass('custom-desc')
  })
})

describe('CardContent', () => {
  it('renders children', () => {
    render(<CardContent>Content here</CardContent>)
    expect(screen.getByText('Content here')).toBeInTheDocument()
  })

  it('accepts custom className', () => {
    const { container } = render(<CardContent className="custom-content">Content</CardContent>)
    expect(container.firstChild).toHaveClass('custom-content')
  })
})

describe('CardFooter', () => {
  it('renders children', () => {
    render(<CardFooter>Footer content</CardFooter>)
    expect(screen.getByText('Footer content')).toBeInTheDocument()
  })

  it('applies border and spacing', () => {
    const { container } = render(<CardFooter>Footer</CardFooter>)
    expect(container.firstChild).toHaveClass('mt-4', 'pt-4', 'border-t', 'border-border')
  })

  it('accepts custom className', () => {
    const { container } = render(<CardFooter className="custom-footer">Footer</CardFooter>)
    expect(container.firstChild).toHaveClass('custom-footer')
  })
})

describe('Card composition', () => {
  it('renders complete card structure', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Card Title</CardTitle>
          <CardDescription>Card description</CardDescription>
        </CardHeader>
        <CardContent>Main content</CardContent>
        <CardFooter>Footer actions</CardFooter>
      </Card>
    )

    expect(screen.getByText('Card Title')).toBeInTheDocument()
    expect(screen.getByText('Card description')).toBeInTheDocument()
    expect(screen.getByText('Main content')).toBeInTheDocument()
    expect(screen.getByText('Footer actions')).toBeInTheDocument()
  })
})
