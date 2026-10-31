import Link from 'next/link'
import { TallyArt } from '@/components/ui/TallyArt'

// Revenue needs purchase events (order id, amount, currency) from the tracker,
// which it does not send yet. Until it does there is nothing real to show, so
// this page says so instead of drawing placeholder numbers.
export default function RevenuePage() {
  return (
    <div className="max-w-xl mx-auto text-center py-16">
      <TallyArt pose="count" className="mx-auto mb-6" />
      <h1 className="text-2xl font-bold mb-3">Revenue is not available yet</h1>
      <p className="text-muted-foreground mb-6">
        Revenue reporting needs the tracker to record purchases, and it does not do that yet. In the
        meantime you can count checkouts as conversions with a goal or a conversion rule.
      </p>
      <Link href="/dashboard/goals" className="text-primary font-medium hover:underline">
        Set up a goal
      </Link>
    </div>
  )
}
