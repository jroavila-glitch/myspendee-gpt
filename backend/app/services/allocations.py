from datetime import datetime
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models import Transaction, TransactionAllocation
from app.schemas.common import (
    EXPENSE_CATEGORIES,
    INCOME_CATEGORIES,
    TransactionAllocationInput,
)


MONEY_QUANTUM = Decimal("0.01")
ALLOWED_ALLOCATION_CATEGORIES = {
    "income": set(INCOME_CATEGORIES),
    "expense": set(EXPENSE_CATEGORIES),
}


def _money(value: Decimal) -> Decimal:
    return value.quantize(MONEY_QUANTUM)


def _validate_cent_amount(value: Decimal, field_name: str) -> Decimal:
    amount = _money(value)
    if value != amount:
        raise ValueError(f"Allocation {field_name} must use cents")
    if amount <= 0:
        raise ValueError("Allocation amounts must be positive")
    return amount


def _validate_transaction_type(transaction: Transaction) -> None:
    if transaction.type not in ALLOWED_ALLOCATION_CATEGORIES:
        raise ValueError("Only income or expense transactions can be split")


def _validate_category(transaction: Transaction, category: str, purpose: str) -> None:
    if category not in ALLOWED_ALLOCATION_CATEGORIES[transaction.type]:
        raise ValueError(f"Invalid {transaction.type} {purpose} category: {category}")


def resolve_allocation_amounts(
    transaction: Transaction,
    allocations: list[TransactionAllocationInput],
) -> list[TransactionAllocationInput]:
    if transaction.amount_original is not None:
        original_amounts: list[Decimal] = []
        for allocation in allocations:
            if allocation.amount_original is None:
                raise ValueError("Allocation amount_original is required when the transaction has an original amount")
            amount_original = _validate_cent_amount(allocation.amount_original, "amount_original")
            original_amounts.append(amount_original)

        transaction_original = _money(transaction.amount_original)
        if sum(original_amounts, Decimal("0.00")) != transaction_original:
            raise ValueError("Allocation original amounts must equal transaction original amount")

        transaction_mxn = _money(transaction.amount_mxn)
        resolved: list[TransactionAllocationInput] = []
        assigned_mxn = Decimal("0.00")
        for position, (allocation, amount_original) in enumerate(zip(allocations, original_amounts, strict=True)):
            if position == len(allocations) - 1:
                amount_mxn = transaction_mxn - assigned_mxn
            else:
                amount_mxn = _money(transaction_mxn * amount_original / transaction_original)
                assigned_mxn += amount_mxn
            resolved.append(
                allocation.model_copy(
                    update={
                        "amount_original": amount_original,
                        "amount_mxn": amount_mxn,
                    }
                )
            )
        if any(allocation.amount_mxn <= 0 for allocation in resolved):
            raise ValueError("Allocation amounts must be positive after MXN conversion")
        return resolved

    resolved = []
    for allocation in allocations:
        if allocation.amount_mxn is None:
            raise ValueError("Allocation amount_mxn is required when the transaction has no original amount")
        amount_mxn = _validate_cent_amount(allocation.amount_mxn, "amount_mxn")
        resolved.append(allocation.model_copy(update={"amount_original": None, "amount_mxn": amount_mxn}))

    if sum((allocation.amount_mxn for allocation in resolved), Decimal("0.00")) != _money(transaction.amount_mxn):
        raise ValueError("Allocation MXN amounts must equal transaction MXN amount")
    return resolved


def replace_allocations(
    db: Session,
    transaction: Transaction,
    allocations: list[TransactionAllocationInput],
) -> list[TransactionAllocation]:
    _validate_transaction_type(transaction)
    if len(allocations) < 2:
        raise ValueError("At least two allocations are required")
    for allocation in allocations:
        _validate_category(transaction, allocation.category, "allocation")

    resolved = resolve_allocation_amounts(transaction, allocations)
    transaction.allocations = [
        TransactionAllocation(
            category=allocation.category,
            amount_original=allocation.amount_original,
            amount_mxn=allocation.amount_mxn,
            notes=allocation.notes,
            position=position,
        )
        for position, allocation in enumerate(resolved)
    ]
    transaction.reviewed_at = datetime.utcnow()
    db.commit()
    db.refresh(transaction)
    return list(transaction.allocations)


def remove_allocations(
    db: Session,
    transaction: Transaction,
    replacement_category: str,
) -> Transaction:
    _validate_transaction_type(transaction)
    _validate_category(transaction, replacement_category, "replacement")
    transaction.allocations = []
    transaction.category = replacement_category
    db.commit()
    db.refresh(transaction)
    return transaction
