import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type Sequelize,
  type NonAttribute,
} from "sequelize";
import type { Trip } from "./Trip";
import type { FuelTicket } from "./FuelTicket";

export class FuelProrationAssignment extends Model<
  InferAttributes<FuelProrationAssignment>,
  InferCreationAttributes<FuelProrationAssignment>
> {
  declare tenant_id: string;
  declare trip_id: string;
  declare fuel_ticket_id: string;
  declare readonly createdAt: CreationOptional<Date>;
  declare readonly updatedAt: CreationOptional<Date>;

  declare Trip?: NonAttribute<Trip>;
  declare FuelTicket?: NonAttribute<FuelTicket>;
}

export function initFuelProrationAssignment(sequelize: Sequelize) {
  FuelProrationAssignment.init(
    {
      tenant_id: { type: DataTypes.CHAR(36), allowNull: false },
      trip_id: { type: DataTypes.CHAR(36), primaryKey: true },
      fuel_ticket_id: { type: DataTypes.CHAR(36), allowNull: false },
    } as never,
    {
      sequelize,
      tableName: "fuel_proration_assignments",
      underscored: true,
      indexes: [
        {
          name: "fuel_proration_assignments_tenant_trip_unique",
          unique: true,
          fields: ["tenant_id", "trip_id"],
        },
        {
          name: "fuel_proration_assignments_tenant_ticket_idx",
          fields: ["tenant_id", "fuel_ticket_id"],
        },
      ],
    },
  );
}
