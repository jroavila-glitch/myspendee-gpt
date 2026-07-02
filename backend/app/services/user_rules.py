from __future__ import annotations

import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Transaction, UserClassificationRule
from app.services.classification import normalize_category

STOP_WORDS = {
    "CARD",
    "COMPRA",
    "PAYMENT",
    "PAGO",
    "PAGAMENTO",
    "WWW",
}


def normalize_rule_text(value: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^A-Z0-9]+", " ", value.upper())).strip()


def infer_pattern_from_description(description: str) -> str:
    normalized = normalize_rule_text(description)
    tokens = [token for token in normalized.split() if token and token not in STOP_WORDS]
    for token in tokens:
        if len(token) >= 4 and not token.isdigit():
            return token
    return tokens[0] if tokens else normalized[:80]


def apply_user_classification_rules(
    db: Session | None,
    *,
    description: str,
    bank_name: str,
    tx_type: str,
) -> tuple[str, str] | None:
    if db is None:
        return None
    normalized_description = normalize_rule_text(description)
    rules = db.scalars(
        select(UserClassificationRule)
        .where(UserClassificationRule.enabled.is_(True))
        .order_by(UserClassificationRule.created_at.desc())
    ).all()
    for rule in rules:
        if rule.bank_name and rule.bank_name != bank_name:
            continue
        if rule.match_type and rule.match_type != tx_type:
            continue
        if normalize_rule_text(rule.description_pattern) not in normalized_description:
            continue
        return rule.target_type, normalize_category(rule.target_category, rule.target_type)
    return None


def create_rule_from_transaction(
    db: Session,
    transaction: Transaction,
    *,
    description_pattern: str | None = None,
    bank_name: str | None = None,
    match_type: str | None = None,
    target_type: str | None = None,
    target_category: str | None = None,
    scope: str = "bank",
) -> UserClassificationRule:
    effective_target_type = target_type or transaction.type
    effective_target_category = normalize_category(target_category or transaction.category, effective_target_type)
    if effective_target_type == "ignored":
        effective_target_category = "ignored"

    rule = UserClassificationRule(
        description_pattern=description_pattern or infer_pattern_from_description(transaction.description),
        bank_name=bank_name if bank_name is not None else (transaction.bank_name if scope == "bank" else None),
        match_type=match_type if match_type is not None else transaction.type,
        target_type=effective_target_type,
        target_category=effective_target_category,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule
