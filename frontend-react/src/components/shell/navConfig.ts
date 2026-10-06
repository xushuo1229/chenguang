import type { ComponentType } from 'react'
import {
  BarChart3,
  BookOpen,
  Bot,
  Brain,
  CalendarRange,
  Home,
  Library,
  Settings,
  ShieldCheck,
  Target,
} from 'lucide-react'

export type NavItem = {
  label: string
  to: string
  icon: ComponentType<{ className?: string }>
  adminOnly?: boolean
  keywords?: string
}

export type NavGroup = {
  id: string
  label?: string
  items: NavItem[]
}

export const topGroup: NavGroup = {
  id: 'core',
  items: [
    {
      label: 'Agent',
      to: '/agent',
      icon: Bot,
      keywords: 'agent ai chat conversation 对话 助手',
    },
    {
      label: 'Workspace',
      to: '/workspace',
      icon: Home,
      keywords: 'workspace today home dashboard 今日 首页',
    },
  ],
}

export const navGroups: NavGroup[] = [
  {
    id: 'learning',
    label: 'Learning',
    items: [
      {
        label: 'Courses',
        to: '/learning/courses',
        icon: BookOpen,
        keywords: 'course courses 课程 课表',
      },
      {
        label: 'Plans',
        to: '/learning/plans',
        icon: CalendarRange,
        keywords: 'plan plans 计划 规划',
      },
      {
        label: 'Knowledge',
        to: '/learning/knowledge',
        icon: Library,
        keywords: 'knowledge graph document 知识 图谱 文档',
      },
    ],
  },
  {
    id: 'growth',
    label: 'Growth',
    items: [
      {
        label: 'Goals',
        to: '/growth/goals',
        icon: Target,
        keywords: 'goal goals 目标',
      },
      {
        label: 'Analytics',
        to: '/growth/analytics',
        icon: BarChart3,
        keywords: 'analytics stats 分析 统计 数据',
      },
      {
        label: 'Growth Memory',
        to: '/growth/memory',
        icon: Brain,
        keywords: 'memory memories 记忆',
      },
    ],
  },
]

export const settingsItem: NavItem = {
  label: 'Settings',
  to: '/settings',
  icon: Settings,
  keywords: 'settings 设置 偏好',
}

export const adminItem: NavItem = {
  label: 'Admin',
  to: '/admin',
  icon: ShieldCheck,
  adminOnly: true,
  keywords: 'admin 管理 后台',
}

export const allNavItems: NavItem[] = [
  ...topGroup.items,
  ...navGroups.flatMap((group) => group.items),
  settingsItem,
  adminItem,
]

export const bottomNavItems: NavItem[] = [
  topGroup.items[0],
  topGroup.items[1],
  navGroups[0].items[0],
  navGroups[1].items[0],
]
