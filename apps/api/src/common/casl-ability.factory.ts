import { AbilityBuilder, createMongoAbility, type MongoAbility } from "@casl/ability";
import { Injectable } from "@nestjs/common";

type AppAction = "manage" | "create" | "read" | "update" | "delete" | "dispatch";
type AppAbility = MongoAbility<[AppAction, string]>;

type RequestUser = {
  permissions?: string[];
};

@Injectable()
export class CaslAbilityFactory {
  createForUser(user: RequestUser): AppAbility {
    const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility);

    for (const permission of user.permissions ?? []) {
      if (permission === "*") {
        can("manage", "all");
        continue;
      }

      const dot = permission.lastIndexOf(".");
      if (dot <= 0) continue;
      const subject = permission.slice(0, dot);
      const action = permission.slice(dot + 1);
      if (!subject || !action) continue;

      can(this.toAction(action), subject);
    }

    return build();
  }

  private toAction(action: string): AppAction {
    if (action === "create" || action === "read" || action === "update" || action === "delete") {
      return action;
    }
    if (action === "dispatch") return "dispatch";
    return "manage";
  }
}
