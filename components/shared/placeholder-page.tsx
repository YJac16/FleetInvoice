import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SearchBar } from "@/components/shared/search-bar";

export interface PlaceholderCard {
  title: string;
  description: string;
  badge?: string;
}

interface PlaceholderPageProps {
  title: string;
  description: string;
  icon: LucideIcon;
  cards: PlaceholderCard[];
  emptyTitle: string;
  emptyDescription: string;
  phaseNote?: string;
}

export function PlaceholderPage({
  title,
  description,
  icon: Icon,
  cards,
  emptyTitle,
  emptyDescription,
  phaseNote = "Available in a later phase.",
}: PlaceholderPageProps) {
  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description={description}
        actions={
          <Badge variant="secondary" className="font-normal">
            Phase 1 foundation
          </Badge>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchBar placeholder={`Search ${title.toLowerCase()}…`} disabled />
        <p className="text-xs text-muted-foreground">{phaseNote}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <Card
            key={card.title}
            className="border-border/80 shadow-sm transition-shadow hover:shadow-md"
          >
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-3">
                <CardTitle className="text-base">{card.title}</CardTitle>
                {card.badge ? (
                  <Badge variant="outline">{card.badge}</Badge>
                ) : null}
              </div>
              <CardDescription>{card.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full w-1/3 rounded-full bg-accent/70" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <EmptyState
        icon={Icon}
        title={emptyTitle}
        description={emptyDescription}
      />
    </div>
  );
}
