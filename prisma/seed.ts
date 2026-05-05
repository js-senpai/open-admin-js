import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { materializeAllRoles, roleMatrixKey } from "@openadminjs/permissions";
import { catalogSlugList, permissionCatalog, roleBlueprints } from "../apps/api/src/access/catalog";
import { publicPermissionCatalog, publicRoleBlueprints } from "../apps/api/src/access/public-catalog";

const prisma = new PrismaClient();

async function main() {
  const mergedCatalog: { name: string; label: { en: string; ru: string } }[] = [...permissionCatalog];
  for (const p of publicPermissionCatalog) {
    if (mergedCatalog.some((row) => row.name === p.name)) continue;
    mergedCatalog.push({ name: p.name, label: p.label });
  }

  for (const row of mergedCatalog) {
    await prisma.permission.upsert({
      where: { name: row.name },
      update: { label: row.label.en },
      create: { name: row.name, label: row.label.en }
    });
  }

  const permissionByName = Object.fromEntries((await prisma.permission.findMany()).map((p) => [p.name, p]));

  const publicSlugs = publicPermissionCatalog.map((p) => p.name);
  const unionSlugs = [...new Set([...catalogSlugList, ...publicSlugs])].sort();
  const allBlueprints = [...roleBlueprints, ...publicRoleBlueprints];

  const matrix = materializeAllRoles(allBlueprints, unionSlugs, {
    admin: catalogSlugList,
    public: publicSlugs
  });

  for (const blueprint of allBlueprints) {
    const realm = blueprint.realm ?? "admin";
    const label =
      typeof blueprint.label === "object" && blueprint.label !== null && "en" in blueprint.label
        ? blueprint.label.en
        : (blueprint.label ?? blueprint.name);
    const role = await prisma.role.upsert({
      where: { name_realm: { name: blueprint.name, realm } },
      update: { label },
      create: { name: blueprint.name, realm, label }
    });

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });

    const expanded = matrix.get(roleMatrixKey(realm, blueprint.name)) ?? [];
    for (const permName of expanded) {
      const perm = permissionByName[permName];
      if (!perm) continue;
      await prisma.rolePermission.create({
        data: { roleId: role.id, permissionId: perm.id }
      });
    }
  }

  const adminRole = await prisma.role.findUniqueOrThrow({
    where: { name_realm: { name: "admin", realm: "admin" } }
  });
  const publicMemberRole = await prisma.role.findUniqueOrThrow({
    where: { name_realm: { name: "member", realm: "public" } }
  });

  const user = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {},
    create: {
      email: "admin@example.com",
      name: "Admin",
      passwordHash: await bcrypt.hash("password", 12)
    }
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: adminRole.id } },
    update: {},
    create: { userId: user.id, roleId: adminRole.id }
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: publicMemberRole.id } },
    update: {},
    create: { userId: user.id, roleId: publicMemberRole.id }
  });

  const viewerRole = await prisma.role.findUnique({
    where: { name_realm: { name: "viewer", realm: "admin" } }
  });
  if (viewerRole) {
    const viewerUser = await prisma.user.upsert({
      where: { email: "viewer@example.com" },
      update: {},
      create: {
        email: "viewer@example.com",
        name: "Viewer",
        passwordHash: await bcrypt.hash("password", 12)
      }
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: viewerUser.id, roleId: viewerRole.id } },
      update: {},
      create: { userId: viewerUser.id, roleId: viewerRole.id }
    });
  }

  const shopper = await prisma.user.upsert({
    where: { email: "shopper@example.com" },
    update: {},
    create: {
      email: "shopper@example.com",
      name: "Shopper",
      passwordHash: await bcrypt.hash("password", 12)
    }
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: shopper.id, roleId: publicMemberRole.id } },
    update: {},
    create: { userId: shopper.id, roleId: publicMemberRole.id }
  });

  const category = await prisma.category.upsert({
    where: { slug: "announcements" },
    update: {},
    create: { name: "Announcements", slug: "announcements" }
  });

  await prisma.post.upsert({
    where: { slug: "welcome-to-openadminjs" },
    update: {},
    create: {
      title: "Welcome to OpenAdminJS",
      slug: "welcome-to-openadminjs",
      status: "published",
      content: "A polished admin starter for Node.js teams.",
      categoryId: category.id,
      authorId: user.id
    }
  });

  await prisma.setting.upsert({
    where: { key: "brand.primaryColor" },
    update: {},
    create: { key: "brand.primaryColor", group: "brand", type: "color", value: "#059669" }
  });

  // ── Commerce seed ──────────────────────────────────────────────────────────
  const sampleProducts = [
    { name: "Starter Plan", slug: "starter-plan", price: 900, currency: "USD", description: "Best for individuals and small projects." },
    { name: "Pro Plan", slug: "pro-plan", price: 2900, currency: "USD", description: "Advanced features for growing teams." },
    { name: "Enterprise Plan", slug: "enterprise-plan", price: 9900, currency: "USD", description: "Full control and priority support." }
  ];

  for (const product of sampleProducts) {
    await prisma.product.upsert({
      where: { slug: product.slug },
      update: {},
      create: { ...product, active: true }
    });
  }
}

main().finally(async () => prisma.$disconnect());
