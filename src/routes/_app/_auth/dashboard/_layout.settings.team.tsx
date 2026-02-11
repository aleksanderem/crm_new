import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/settings/team"
)({
  component: TeamSettings,
});

function TeamSettings() {
  const { organizationId } = useOrganization();

  const { data: members } = useQuery(
    convexQuery(api.organizations.getMembers, { organizationId })
  );

  return (
    <div className="flex h-full w-full flex-col gap-6">
      <PageHeader
        title="Team"
        description="Manage your organization members."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Members</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {members?.map((member) => (
            <div
              key={member._id}
              className="flex items-center justify-between rounded-md px-2 py-2"
            >
              <div className="flex items-center gap-3">
                <Avatar className="h-8 w-8">
                  <AvatarFallback>
                    {(member.name ?? member.email ?? "U")[0].toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium">
                    {member.name ?? member.email}
                  </p>
                  {member.email && (
                    <p className="text-xs text-muted-foreground">
                      {member.email}
                    </p>
                  )}
                </div>
              </div>
              <Badge variant="outline" className="capitalize">
                {member.role}
              </Badge>
            </div>
          ))}
          {(!members || members.length === 0) && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No team members found.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
