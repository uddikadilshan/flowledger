"use client";

import { Building2, Check, ChevronDown, Plus } from "lucide-react";
import type { Business } from "@/lib/domain";
import { Button } from "./vip-ui/button";
import {
  MenuContent,
  MenuItem,
  MenuPopover,
  MenuSeparator,
  MenuTrigger,
} from "./vip-ui/menu";

export function BusinessSwitcher({
  business,
  businesses,
  userId,
  logo,
  disabled,
  onSelect,
  onManage,
  onCreate,
}: {
  business?: Business;
  businesses: Business[];
  userId?: string;
  logo: string;
  disabled: boolean;
  onSelect: (id: string) => void;
  onManage: () => void;
  onCreate: () => void;
}) {
  return (
    <div className="business-switcher">
      <MenuTrigger>
        <Button
          variant="outline"
          type="button"
          size="xl"
          className="business-switcher-trigger"
          aria-label={
            business
              ? `Switch business, current business: ${business.name}`
              : "Choose a business"
          }
          isDisabled={disabled}
        >
          <span className="business-switcher-icon">
            {logo ? (
              <img src={logo} alt="" />
            ) : (
              <Building2 size={19} aria-hidden />
            )}
          </span>
          <span className="business-switcher-label">
            <small>{business ? "Active business" : "Workspace"}</small>
            <strong>{business?.name ?? "Choose a business"}</strong>
          </span>
          <ChevronDown size={16} aria-hidden />
        </Button>
        <MenuPopover
          placement="bottom start"
          className="business-switcher-menu"
        >
          <MenuContent aria-label="Switch business">
            {businesses.map((option) => {
              const current = option.id === business?.id;
              return (
                <MenuItem
                  key={option.id}
                  id={option.id}
                  textValue={option.name}
                  aria-current={current ? "true" : undefined}
                  onAction={() => {
                    if (!current) onSelect(option.id);
                  }}
                >
                  <span className="business-switcher-icon">
                    <Building2 size={16} aria-hidden />
                  </span>
                  <span className="business-switcher-label">
                    <strong>{option.name}</strong>
                    <small>
                      {option.owner_id === userId ? "Owner" : "Viewer"} ·{" "}
                      {option.currency}
                    </small>
                  </span>
                  {current && (
                    <Check size={16} className="accent" aria-hidden />
                  )}
                </MenuItem>
              );
            })}
            {businesses.length > 0 && <MenuSeparator />}
            <MenuItem onAction={onManage}>
              <Building2 size={16} aria-hidden /> Manage businesses
            </MenuItem>
            <MenuItem onAction={onCreate}>
              <Plus size={16} aria-hidden /> Add business
            </MenuItem>
          </MenuContent>
        </MenuPopover>
      </MenuTrigger>
    </div>
  );
}
