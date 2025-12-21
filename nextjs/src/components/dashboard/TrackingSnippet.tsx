'use client'

import { useState } from 'react'
import { Modal, ModalFooter, Button, Alert } from '@/components/ui'

interface TrackingSnippetProps {
  isOpen: boolean
  onClose: () => void
  siteId: string
  domain?: string
}

export function TrackingSnippet({ isOpen, onClose, siteId, domain }: TrackingSnippetProps) {
  const [copied, setCopied] = useState(false)

  const snippet = `<script defer data-site="${siteId}" src="https://ztas.io/s.js"></script>`

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(snippet)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Tracking Snippet"
      description={domain ? `Add this snippet to ${domain}` : 'Add this snippet to your website'}
    >
      <div className="space-y-4">
        <div className="relative">
          <pre className="p-4 bg-gray-900 text-gray-100 rounded-lg overflow-x-auto text-sm">
            <code>{snippet}</code>
          </pre>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleCopy}
            className="absolute top-2 right-2"
          >
            {copied ? (
              <>
                <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
                Copy
              </>
            )}
          </Button>
        </div>

        <Alert variant="info" title="Installation Instructions">
          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>Copy the snippet above</li>
            <li>Paste it into the <code className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded">&lt;head&gt;</code> section of your HTML</li>
            <li>Deploy your changes</li>
            <li>Visit your site to verify tracking is working</li>
          </ol>
        </Alert>

        <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
          <h4 className="font-medium mb-2">Alternative Installation Methods</h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <a
              href="https://docs.ztas.io/install/nextjs"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Next.js
            </a>
            <a
              href="https://docs.ztas.io/install/gatsby"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Gatsby
            </a>
            <a
              href="https://docs.ztas.io/install/wordpress"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              WordPress
            </a>
            <a
              href="https://docs.ztas.io/install/shopify"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Shopify
            </a>
          </div>
        </div>
      </div>

      <ModalFooter>
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      </ModalFooter>
    </Modal>
  )
}
