import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type Sequelize,
} from "sequelize";

export class TripStatusAssignment extends Model<
  InferAttributes<TripStatusAssignment>,
  InferCreationAttributes<TripStatusAssignment>
> {
  declare trip_id: string;
  declare trip_status_id: string;
  declare readonly createdAt: CreationOptional<Date>;
  declare readonly updatedAt: CreationOptional<Date>;
}

export function initTripStatusAssignment(sequelize: Sequelize) {
  TripStatusAssignment.init(
    {
      trip_id: { type: DataTypes.CHAR(36), primaryKey: true },
      trip_status_id: { type: DataTypes.CHAR(36), primaryKey: true },
    } as never,
    { sequelize, tableName: "trip_status_assignments", underscored: true },
  );
}
