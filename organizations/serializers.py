from rest_framework import serializers
from django.contrib.auth.models import User
from django.contrib.auth import authenticate
from django.db import models
from django.core.exceptions import ValidationError as DjangoValidationError
from .models import (
    Organization, OrganizationUser, StrategicObjective,
    Program, StrategicInitiative, PerformanceMeasure, MainActivity,
    ActivityBudget, ActivityCostingAssumption, InitiativeFeed,
    Location, LandTransport, AirTransport, PerDiem, Accommodation,
    ParticipantCost, SessionCost, PrintingCost, SupervisorCost,
    ProcurementItem, Plan, PlanReview, SubActivity, Report,
    PerformanceAchievement, ActivityAchievement, SubActivityBudgetUtilization
)
from decimal import Decimal, InvalidOperation
import json

class OrganizationSerializer(serializers.ModelSerializer):
    parentId = serializers.IntegerField(source='parent_id', read_only=True)
    coreValues = serializers.ListField(source='core_values', read_only=True)

    class Meta:
        model = Organization
        fields = ['id', 'name', 'type', 'parent', 'parentId', 'vision', 'mission', 'core_values', 'coreValues', 'created_at', 'updated_at']

class OrganizationUserSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)
    organization_name = serializers.CharField(source='organization.name', read_only=True)

    class Meta:
        model = OrganizationUser
        fields = ['id', 'user', 'username', 'organization', 'organization_name', 'role', 'created_at']

class StrategicObjectiveSerializer(serializers.ModelSerializer):
    effective_weight = serializers.SerializerMethodField()
    programs = serializers.SerializerMethodField()
    initiatives = serializers.SerializerMethodField()
    total_initiatives_weight = serializers.SerializerMethodField()

    class Meta:
        model = StrategicObjective
        fields = [
            'id', 'title', 'description', 'weight', 'planner_weight', 'effective_weight',
            'is_default', 'created_at', 'updated_at', 'programs', 'initiatives',
            'total_initiatives_weight'
        ]

    def get_effective_weight(self, obj):
        """
        Get effective weight with proper error handling and type conversion
        """
        try:
            effective_weight = obj.get_effective_weight()
            # Ensure it's a valid number
            if effective_weight is None:
                return float(obj.weight) if obj.weight is not None else 0.0
            return float(effective_weight)
        except (ValueError, TypeError, AttributeError) as e:
            print(f"Error getting effective weight for objective {obj.id}: {e}")
            # Fallback to regular weight
            try:
                return float(obj.weight) if obj.weight is not None else 0.0
            except (ValueError, TypeError):
                return 0.0

    def get_programs(self, obj):
        """
        Get programs with error handling
        """
        try:
            programs = obj.programs.all()
            return ProgramSerializer(programs, many=True).data
        except Exception as e:
            print(f"Error getting programs for objective {obj.id}: {e}")
            return []

    def get_initiatives(self, obj):
        """
        Get initiatives with error handling
        """
        try:
            initiatives = obj.initiatives.all()
            print(f"StrategicObjectiveSerializer.get_initiatives for objective '{obj.title}' (ID: {obj.id}): Found {initiatives.count()} initiatives")

            # Check if user is admin
            request = self.context.get('request')
            is_admin = False
            if request and hasattr(request, 'user') and request.user.is_authenticated:
                from .models import OrganizationUser
                user_roles = OrganizationUser.objects.filter(user=request.user).values_list('role', flat=True)
                is_admin = 'ADMIN' in user_roles
                print(f"  User: {request.user.username}, Is Admin: {is_admin}, Roles: {list(user_roles)}")

            serialized = StrategicInitiativeSerializer(initiatives, many=True, context=self.context).data
            print(f"  Serialized {len(serialized)} initiatives")

            for init in serialized:
                print(f"    - Initiative: {init.get('name')} (Org: {init.get('organization')}, Measures: {len(init.get('performance_measures', []))}, Activities: {len(init.get('main_activities', []))})")

            return serialized
        except Exception as e:
            print(f"Error getting initiatives for objective {obj.id}: {e}")
            import traceback
            traceback.print_exc()
            return []

    def get_total_initiatives_weight(self, obj):
        """
        Get total initiatives weight with error handling
        """
        try:
            initiatives = obj.initiatives.all()
            total = 0
            for initiative in initiatives:
                try:
                    weight = float(initiative.weight) if initiative.weight is not None else 0
                    total += weight
                except (ValueError, TypeError):
                    continue
            return total
        except Exception as e:
            print(f"Error calculating total initiatives weight for objective {obj.id}: {e}")
            return 0

class ProgramSerializer(serializers.ModelSerializer):
    strategic_objective_title = serializers.CharField(source='strategic_objective.title', read_only=True)
    initiatives = serializers.SerializerMethodField()

    class Meta:
        model = Program
        fields = ['id', 'name', 'description', 'strategic_objective', 'strategic_objective_title', 'is_default', 'created_at', 'updated_at', 'initiatives']

    def get_initiatives(self, obj):
        initiatives = obj.initiatives.all()
        return StrategicInitiativeSerializer(initiatives, many=True, context=self.context).data

class InitiativeFeedSerializer(serializers.ModelSerializer):
    strategic_objective_title = serializers.CharField(source='strategic_objective.title', read_only=True)

    class Meta:
        model = InitiativeFeed
        fields = ['id', 'name', 'description', 'strategic_objective', 'strategic_objective_title', 'is_active', 'created_at', 'updated_at']

class StrategicInitiativeSerializer(serializers.ModelSerializer):
    organization_name = serializers.CharField(source='organization.name', read_only=True)
    performance_measures = serializers.SerializerMethodField()
    main_activities = serializers.SerializerMethodField()
    total_measures_weight = serializers.SerializerMethodField()
    total_activities_weight = serializers.SerializerMethodField()
    initiative_feed_name = serializers.CharField(source='initiative_feed.name', read_only=True)

    class Meta:
        model = StrategicInitiative
        fields = [
            'id', 'name', 'weight', 'strategic_objective', 'program', 'organization',
            'organization_name', 'is_default', 'initiative_feed', 'initiative_feed_name',
            'performance_measures', 'main_activities', 'total_measures_weight',
            'total_activities_weight', 'created_at', 'updated_at'
        ]

    def get_performance_measures(self, obj):
        try:
            measures = obj.performance_measures.all()
            print(f"    StrategicInitiativeSerializer.get_performance_measures for '{obj.name}': Found {measures.count()} measures")
            serialized = PerformanceMeasureSerializer(measures, many=True).data
            print(f"      Serialized {len(serialized)} measures")
            return serialized
        except Exception as e:
            print(f"Error getting performance measures for initiative {obj.id}: {e}")
            return []

    def get_main_activities(self, obj):
        try:
            activities = obj.main_activities.all()
            print(f"    StrategicInitiativeSerializer.get_main_activities for '{obj.name}': Found {activities.count()} activities")
            serialized = MainActivitySerializer(activities, many=True, context=self.context).data
            print(f"      Serialized {len(serialized)} activities")
            return serialized
        except Exception as e:
            print(f"Error getting main activities for initiative {obj.id}: {e}")
            return []

    def get_total_measures_weight(self, obj):
        try:
            measures = obj.performance_measures.all()
            return sum(float(measure.weight or 0) for measure in measures)
        except Exception as e:
            print(f"Error calculating total measures weight for initiative {obj.id}: {e}")
            return 0

    def get_total_activities_weight(self, obj):
        try:
            activities = obj.main_activities.all()
            return sum(float(activity.weight or 0) for activity in activities)
        except Exception as e:
            print(f"Error calculating total activities weight for initiative {obj.id}: {e}")
            return 0

class PerformanceMeasureSerializer(serializers.ModelSerializer):
    organization_name = serializers.CharField(source='organization.name', read_only=True)

    class Meta:
        model = PerformanceMeasure
        fields = [
            'id', 'initiative', 'name', 'weight', 'baseline', 'target_type',
            'q1_target', 'q2_target', 'q3_target', 'q4_target', 'annual_target',
            'selected_months', 'selected_quarters', 'organization', 'organization_name',
            'created_at', 'updated_at'
        ]

    def validate(self, data):
        # Ensure organization is set from request user
        if not data.get('organization'):
            user = self.context['request'].user
            user_org = user.organization_users.first()
            if user_org:
                data['organization'] = user_org.organization

        # Validate period selection
        selected_months = data.get('selected_months', [])
        selected_quarters = data.get('selected_quarters', [])

        if not selected_months and not selected_quarters:
            raise serializers.ValidationError('At least one month or quarter must be selected')

        return data

class SubActivitySerializer(serializers.ModelSerializer):
    total_funding = serializers.SerializerMethodField()
    estimated_cost = serializers.SerializerMethodField()
    funding_gap = serializers.SerializerMethodField()

    class Meta:
        model = SubActivity
        fields = [
            'id', 'main_activity', 'name', 'activity_type', 'description',
            'budget_calculation_type', 'estimated_cost_with_tool', 'estimated_cost_without_tool',
            'government_treasury', 'sdg_funding', 'partners_funding', 'other_funding',
            'training_details', 'meeting_workshop_details', 'procurement_details',
            'printing_details', 'supervision_details', 'partners_details',
            'total_funding', 'estimated_cost', 'funding_gap',
            'created_at', 'updated_at'
        ]

    def get_total_funding(self, obj):
        return obj.total_funding

    def get_estimated_cost(self, obj):
        return obj.estimated_cost

    def get_funding_gap(self, obj):
        return obj.funding_gap

    def validate(self, data):
        # Validate that estimated cost is positive
        estimated_cost_with_tool = data.get('estimated_cost_with_tool', 0)
        estimated_cost_without_tool = data.get('estimated_cost_without_tool', 0)

        if estimated_cost_with_tool <= 0 and estimated_cost_without_tool <= 0:
            raise serializers.ValidationError('At least one estimated cost must be greater than 0')

        return data


class MainActivitySerializer(serializers.ModelSerializer):
    organization_name = serializers.CharField(source='organization.name', read_only=True)
    sub_activities = serializers.SerializerMethodField()
    total_budget = serializers.SerializerMethodField()
    total_funding = serializers.SerializerMethodField()
    funding_gap = serializers.SerializerMethodField()

    class Meta:
        model = MainActivity
        fields = [
            'id', 'initiative', 'name', 'weight', 'baseline', 'target_type',
            'q1_target', 'q2_target', 'q3_target', 'q4_target', 'annual_target',
            'selected_months', 'selected_quarters', 'organization', 'organization_name',
            'sub_activities', 'total_budget', 'total_funding', 'funding_gap',
            'created_at', 'updated_at'
        ]

    def get_sub_activities(self, obj):
        """Return sub_activities, filtering by plan organization if context provides it"""
        try:
            all_sub_activities = obj.sub_activities.all()

            # Check if we have a plan_organization_id in context (from admin view)
            plan_org_id = self.context.get('plan_organization_id')

            if plan_org_id:
                # Filter sub_activities to only show those from the plan's organization
                # Sub-activities don't have organization field directly, but their main_activity does
                # Since we're already serializing a MainActivity that was filtered by organization,
                # we just need to ensure we're getting sub_activities for THIS activity
                # which should all belong to the same organization as the MainActivity
                filtered_sub_activities = all_sub_activities.filter(main_activity__organization_id=plan_org_id)
                return SubActivitySerializer(filtered_sub_activities, many=True).data

            # Default: return all sub_activities for this MainActivity
            return SubActivitySerializer(all_sub_activities, many=True).data
        except Exception as e:
            print(f"Error getting sub_activities for activity {obj.id}: {e}")
            import traceback
            traceback.print_exc()
            return []

    def get_total_budget(self, obj):
        try:
            return obj.total_budget
        except Exception as e:
            print(f"Error getting total_budget for activity {obj.id}: {e}")
            return 0

    def get_total_funding(self, obj):
        try:
            return obj.total_funding
        except Exception as e:
            print(f"Error getting total_funding for activity {obj.id}: {e}")
            return 0

    def get_funding_gap(self, obj):
        try:
            return obj.funding_gap
        except Exception as e:
            print(f"Error getting funding_gap for activity {obj.id}: {e}")
            return 0


    def validate(self, data):
        """Ensure organization is set, then let model handle weight validation"""
        # Set organization from authenticated user
        if not data.get('organization'):
            user = self.context['request'].user
            user_org = user.organization_users.first()
            if user_org:
                data['organization'] = user_org.organization

        # Validate period selection
        selected_months = data.get('selected_months', [])
        selected_quarters = data.get('selected_quarters', [])

        if not selected_months and not selected_quarters:
            raise serializers.ValidationError('At least one month or quarter must be selected')

        # Let Django model clean() method handle all weight validation
        return data
    def create(self, validated_data):
        """Create with proper error handling"""
        try:
            return super().create(validated_data)
        except DjangoValidationError as e:
            # Convert Django validation errors to DRF format
            raise serializers.ValidationError(e.messages)
    
    def update(self, instance, validated_data):
        """Update with proper error handling"""
        try:
            return super().update(instance, validated_data)
        except DjangoValidationError as e:
            # Convert Django validation errors to DRF format
            raise serializers.ValidationError(e.messages)


class ActivityBudgetSerializer(serializers.ModelSerializer):
    total_funding = serializers.SerializerMethodField()
    estimated_cost = serializers.SerializerMethodField()
    funding_gap = serializers.SerializerMethodField()

    class Meta:
        model = ActivityBudget
        fields = [
            'id', 'activity', 'sub_activity_id', 'budget_calculation_type', 'activity_type',
            'estimated_cost_with_tool', 'estimated_cost_without_tool',
            'government_treasury', 'sdg_funding', 'partners_funding', 'other_funding',
            'training_details', 'meeting_workshop_details', 'procurement_details',
            'printing_details', 'supervision_details', 'partners_details',
            'total_funding', 'estimated_cost', 'funding_gap',
            'created_at', 'updated_at'
        ]

    def get_total_funding(self, obj):
        return obj.total_funding

    def get_estimated_cost(self, obj):
        return obj.estimated_cost

    def get_funding_gap(self, obj):
        return obj.funding_gap

class ActivityCostingAssumptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ActivityCostingAssumption
        fields = '__all__'

# Location and transport serializers
class LocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Location
        fields = '__all__'

class LandTransportSerializer(serializers.ModelSerializer):
    origin_name = serializers.CharField(source='origin.name', read_only=True)
    destination_name = serializers.CharField(source='destination.name', read_only=True)

    class Meta:
        model = LandTransport
        fields = ['id', 'origin', 'destination', 'origin_name', 'destination_name', 'trip_type', 'price', 'created_at', 'updated_at']

class AirTransportSerializer(serializers.ModelSerializer):
    origin_name = serializers.CharField(source='origin.name', read_only=True)
    destination_name = serializers.CharField(source='destination.name', read_only=True)

    class Meta:
        model = AirTransport
        fields = ['id', 'origin', 'destination', 'origin_name', 'destination_name', 'price', 'created_at', 'updated_at']

class PerDiemSerializer(serializers.ModelSerializer):
    location_name = serializers.CharField(source='location.name', read_only=True)

    class Meta:
        model = PerDiem
        fields = ['id', 'location', 'location_name', 'amount', 'hardship_allowance_amount', 'created_at', 'updated_at']

class AccommodationSerializer(serializers.ModelSerializer):
    location_name = serializers.CharField(source='location.name', read_only=True)
    service_type_display = serializers.CharField(source='get_service_type_display', read_only=True)

    class Meta:
        model = Accommodation
        fields = ['id', 'location', 'location_name', 'service_type', 'service_type_display', 'price', 'created_at', 'updated_at']

class ParticipantCostSerializer(serializers.ModelSerializer):
    cost_type_display = serializers.CharField(source='get_cost_type_display', read_only=True)

    class Meta:
        model = ParticipantCost
        fields = ['id', 'cost_type', 'cost_type_display', 'price', 'created_at', 'updated_at']

class SessionCostSerializer(serializers.ModelSerializer):
    cost_type_display = serializers.CharField(source='get_cost_type_display', read_only=True)

    class Meta:
        model = SessionCost
        fields = ['id', 'cost_type', 'cost_type_display', 'price', 'created_at', 'updated_at']

class PrintingCostSerializer(serializers.ModelSerializer):
    document_type_display = serializers.CharField(source='get_document_type_display', read_only=True)

    class Meta:
        model = PrintingCost
        fields = ['id', 'document_type', 'document_type_display', 'price_per_page', 'created_at', 'updated_at']

class SupervisorCostSerializer(serializers.ModelSerializer):
    cost_type_display = serializers.CharField(source='get_cost_type_display', read_only=True)

    class Meta:
        model = SupervisorCost
        fields = ['id', 'cost_type', 'cost_type_display', 'amount', 'created_at', 'updated_at']

class ProcurementItemSerializer(serializers.ModelSerializer):
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    unit_display = serializers.CharField(source='get_unit_display', read_only=True)

    class Meta:
        model = ProcurementItem
        fields = ['id', 'category', 'category_display', 'name', 'unit', 'unit_display', 'unit_price', 'created_at', 'updated_at']

class PlanReviewSerializer(serializers.ModelSerializer):
    evaluator_name = serializers.SerializerMethodField()

    class Meta:
        model = PlanReview
        fields = ['id', 'plan', 'evaluator', 'evaluator_name', 'status', 'feedback', 'reviewed_at']

    def get_evaluator_name(self, obj):
        if obj.evaluator and obj.evaluator.user:
            return f"{obj.evaluator.user.first_name} {obj.evaluator.user.last_name}".strip() or obj.evaluator.user.username
        return "System"

class PlanSerializer(serializers.ModelSerializer):
    organization_name = serializers.CharField(source='organization.name', read_only=True)
    objectives = serializers.SerializerMethodField()
    reviews = PlanReviewSerializer(many=True, read_only=True)
    selected_objectives = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=StrategicObjective.objects.all(),
        required=False
    )
    selected_objectives_weights = serializers.JSONField(required=False, allow_null=True)
    strategic_objective = serializers.PrimaryKeyRelatedField(
        queryset=StrategicObjective.objects.all(),
        required=False,
        allow_null=True
    )

    class Meta:
        model = Plan
        fields = [
            'id', 'organization', 'organization_name', 'planner_name', 'type',
            'executive_name', 'strategic_objective', 'program', 'fiscal_year',
            'from_date', 'to_date', 'status', 'submitted_at', 'selected_objectives',
            'selected_objectives_weights', 'objectives', 'reviews',
            'created_at', 'updated_at'
        ]

    def validate(self, data):
        """Validate plan data before saving"""
        print(f"PlanSerializer.validate called with data: {data}")

        # Validate date range
        if data.get('to_date') and data.get('from_date'):
            if data['to_date'] <= data['from_date']:
                raise serializers.ValidationError('End date must be after start date')

        # Validate required fields
        if not data.get('planner_name'):
            raise serializers.ValidationError('Planner name is required')

        if not data.get('organization'):
            raise serializers.ValidationError('Organization is required')

        # Validate fiscal year
        if not data.get('fiscal_year'):
            raise serializers.ValidationError('Fiscal year is required')

        # Validate plan type
        if not data.get('type'):
            raise serializers.ValidationError('Plan type is required')

        # Validate objectives
        selected_objectives = data.get('selected_objectives', [])
        if not selected_objectives:
            raise serializers.ValidationError('At least one objective must be selected')

        # Set strategic_objective to first selected objective
        if selected_objectives:
            # Already have object instances from PrimaryKeyRelatedField
            data['strategic_objective'] = selected_objectives[0]

        # Validate selected objectives weights if provided
        selected_objectives_weights = data.get('selected_objectives_weights')
        if not selected_objectives_weights:
            raise serializers.ValidationError('Objective weights are required')

        if not isinstance(selected_objectives_weights, dict):
            raise serializers.ValidationError('Selected objectives weights must be a dictionary')

        # Validate weight values
        for obj_id, weight in selected_objectives_weights.items():
            try:
                weight_value = float(weight)
                if weight_value < 0 or weight_value > 100:
                    raise serializers.ValidationError(f'Weight for objective {obj_id} must be between 0 and 100')
            except (ValueError, TypeError):
                raise serializers.ValidationError(f'Invalid weight value for objective {obj_id}')

        # Validate total weight equals 100%
        total_weight = sum(float(weight) for weight in selected_objectives_weights.values())
        if abs(total_weight - 100.0) > 0.01:
            raise serializers.ValidationError(
                f'Total weight of selected objectives must equal 100%. Current total: {total_weight}%'
            )

        print(f"PlanSerializer.validate completed successfully for data: {data}")

        return data

    def create(self, validated_data):
        """Custom create method to handle selected_objectives and weights"""
        print(f"PlanSerializer.create called with data: {validated_data}")

        try:
            # Extract many-to-many data - already contains object instances
            selected_objectives_data = validated_data.pop('selected_objectives', [])
            selected_objectives_weights = validated_data.pop('selected_objectives_weights', None)

            print(f"Extracted selected_objectives: {[obj.id for obj in selected_objectives_data]}")
            print(f"Extracted selected_objectives_weights: {selected_objectives_weights}")

            # Create the plan instance
            plan = Plan.objects.create(**validated_data)
            print(f"Created plan with ID: {plan.id}")

            # Set the selected objectives (many-to-many relationship)
            plan.selected_objectives.set(selected_objectives_data)
            print(f"Set selected objectives for plan {plan.id}: {[obj.id for obj in selected_objectives_data]}")

            # Save the weights mapping
            if selected_objectives_weights:
                plan.selected_objectives_weights = selected_objectives_weights
                plan.save()
                print(f"Saved selected objectives weights for plan {plan.id}: {selected_objectives_weights}")
            else:
                print(f"No selected_objectives_weights provided for plan {plan.id}")

            return plan
        except Exception as e:
            print(f"Error in PlanSerializer.create: {e}")
            print(f"Validated data was: {validated_data}")
            raise serializers.ValidationError(f"Failed to create plan: {str(e)}")

    def update(self, instance, validated_data):
        """Custom update method to handle selected_objectives and weights"""
        print(f"PlanSerializer.update called for plan {instance.id} with data: {validated_data}")

        # Extract many-to-many data - already contains object instances
        selected_objectives_data = validated_data.pop('selected_objectives', None)
        selected_objectives_weights = validated_data.pop('selected_objectives_weights', None)

        # Update regular fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        # Update selected objectives if provided
        if selected_objectives_data is not None:
            instance.selected_objectives.set(selected_objectives_data)
            print(f"Updated selected objectives for plan {instance.id}: {[obj.id for obj in selected_objectives_data]}")

        # Update weights mapping if provided
        if selected_objectives_weights is not None:
            instance.selected_objectives_weights = selected_objectives_weights
            print(f"Updated selected objectives weights for plan {instance.id}: {selected_objectives_weights}")

        instance.save()
        return instance

    def get_objectives(self, obj):
        """Get all selected objectives with their complete data"""
        # Get all selected objectives as instances
        selected_objectives = obj.selected_objectives.all()

        # If no selected objectives, fall back to the single strategic_objective
        if not selected_objectives and obj.strategic_objective:
            selected_objectives = [obj.strategic_objective]

        print(f"PlanSerializer.get_objectives for plan {obj.id}: {len(selected_objectives)} objectives")
        serialized_data = StrategicObjectiveSerializer(selected_objectives, many=True, context=self.context).data

        for idx, obj_data in enumerate(serialized_data):
            initiatives_count = len(obj_data.get('initiatives', []))
            print(f"  Objective {idx}: {obj_data.get('title')} has {initiatives_count} initiatives")

        return serialized_data

class UserSerializer(serializers.ModelSerializer):
    userOrganizations = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'userOrganizations']

    def get_userOrganizations(self, obj):
        org_users = obj.organization_users.all()
        return [{
            'organization': org_user.organization.id,
            'organization_name': org_user.organization.name,
            'role': org_user.role
        } for org_user in org_users]

class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField()

    def validate(self, data):
        username = data.get('username')
        password = data.get('password')

        if username and password:
            user = authenticate(username=username, password=password)
            if not user:
                raise serializers.ValidationError('Invalid credentials')
            if not user.is_active:
                raise serializers.ValidationError('User account is disabled')
            data['user'] = user
        else:
            raise serializers.ValidationError('Must include username and password')

        return data

class ProfileUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['first_name', 'last_name', 'email']

    def validate_email(self, value):
        if value and User.objects.filter(email=value).exclude(id=self.instance.id if self.instance else None).exists():
            raise serializers.ValidationError('This email address is already in use.')
        return value

class PasswordChangeSerializer(serializers.Serializer):
    current_password = serializers.CharField()
    new_password = serializers.CharField(min_length=8)

    def validate_current_password(self, value):
        user = self.context['request'].user
        if not user.check_password(value):
            raise serializers.ValidationError('Current password is incorrect.')
        return value

class PerformanceAchievementSerializer(serializers.ModelSerializer):
    performance_measure_name = serializers.CharField(source='performance_measure.name', read_only=True)

    class Meta:
        model = PerformanceAchievement
        fields = ['id', 'report', 'performance_measure', 'performance_measure_name', 'achievement', 'justification', 'created_at', 'updated_at']

class ActivityAchievementSerializer(serializers.ModelSerializer):
    main_activity_name = serializers.CharField(source='main_activity.name', read_only=True)

    class Meta:
        model = ActivityAchievement
        fields = ['id', 'report', 'main_activity', 'main_activity_name', 'achievement', 'justification', 'created_at', 'updated_at']

class SubActivityBudgetUtilizationSerializer(serializers.ModelSerializer):
    sub_activity_name = serializers.CharField(source='sub_activity.name', read_only=True)
    main_activity_id = serializers.IntegerField(source='sub_activity.main_activity.id', read_only=True)
    main_activity_name = serializers.CharField(source='sub_activity.main_activity.name', read_only=True)
    total_utilized = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True, source='get_total_utilized')

    government_treasury = serializers.DecimalField(max_digits=12, decimal_places=2, source='sub_activity.government_treasury', read_only=True)
    sdg_funding = serializers.DecimalField(max_digits=12, decimal_places=2, source='sub_activity.sdg_funding', read_only=True)
    partners_funding = serializers.DecimalField(max_digits=12, decimal_places=2, source='sub_activity.partners_funding', read_only=True)
    other_funding = serializers.DecimalField(max_digits=12, decimal_places=2, source='sub_activity.other_funding', read_only=True)

    class Meta:
        model = SubActivityBudgetUtilization
        fields = [
            'id', 'report', 'sub_activity', 'sub_activity_name', 'main_activity_id', 'main_activity_name',
            'government_treasury', 'sdg_funding', 'partners_funding', 'other_funding',
            'government_treasury_utilized', 'sdg_funding_utilized',
            'partners_funding_utilized', 'other_funding_utilized',
            'total_utilized', 'created_at', 'updated_at'
        ]

class ReportSerializer(serializers.ModelSerializer):
    organization_name = serializers.CharField(source='organization.name', read_only=True)
    planner_name = serializers.SerializerMethodField()
    evaluator_name = serializers.SerializerMethodField()
    report_type_display = serializers.CharField(source='get_report_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    performance_achievements = PerformanceAchievementSerializer(many=True, read_only=True)
    activity_achievements = ActivityAchievementSerializer(many=True, read_only=True)
    budget_utilizations = SubActivityBudgetUtilizationSerializer(many=True, read_only=True)

    class Meta:
        model = Report
        fields = [
            'id', 'plan', 'organization', 'organization_name', 'planner', 'planner_name',
            'evaluator', 'evaluator_name', 'report_type', 'report_type_display', 'report_date',
            'narrative_report', 'status', 'status_display', 'evaluator_feedback', 'evaluated_at',
            'submitted_at', 'performance_achievements', 'activity_achievements', 'budget_utilizations',
            'created_at', 'updated_at'
        ]

    def get_planner_name(self, obj):
        if obj.planner:
            return f"{obj.planner.first_name} {obj.planner.last_name}".strip() or obj.planner.username
        return "Unknown"

    def get_evaluator_name(self, obj):
        if obj.evaluator:
            return f"{obj.evaluator.first_name} {obj.evaluator.last_name}".strip() or obj.evaluator.username
        return None

    def validate(self, data):
        plan = data.get('plan')

        if plan and plan.status != 'APPROVED':
            raise serializers.ValidationError('Can only create reports for approved plans')

        return data


# ===================================
# ADMIN-SPECIFIC SERIALIZERS
# These serializers are used for admin views and DO NOT filter by organization
# ===================================

class AdminStrategicObjectiveSerializer(serializers.ModelSerializer):
    """Admin serializer that returns ALL initiatives without organization filtering"""
    programs = serializers.SerializerMethodField()
    initiatives = serializers.SerializerMethodField()
    effective_weight = serializers.SerializerMethodField()
    total_initiatives_weight = serializers.SerializerMethodField()

    class Meta:
        model = StrategicObjective
        fields = [
            'id', 'title', 'description', 'weight', 'planner_weight', 'effective_weight',
            'is_default', 'created_at', 'updated_at', 'programs', 'initiatives',
            'total_initiatives_weight'
        ]

    def get_effective_weight(self, obj):
        try:
            effective_weight = obj.get_effective_weight()
            if effective_weight is None:
                return float(obj.weight) if obj.weight is not None else 0.0
            return float(effective_weight)
        except (ValueError, TypeError, AttributeError):
            try:
                return float(obj.weight) if obj.weight is not None else 0.0
            except (ValueError, TypeError):
                return 0.0

    def get_programs(self, obj):
        try:
            programs = obj.programs.all()
            return ProgramSerializer(programs, many=True).data
        except Exception as e:
            print(f"AdminStrategicObjectiveSerializer - Error getting programs: {e}")
            return []

    def get_initiatives(self, obj):
        """Return initiatives filtered by plan's organization (defaults + org-specific)"""
        try:
            # Get ALL initiatives for this objective
            all_initiatives = obj.initiatives.all()
            print(f"[ADMIN SERIALIZER] Objective '{obj.title}': Found {all_initiatives.count()} total initiatives")

            # Get plan's organization from context
            plan_org_id = self.context.get('plan_organization_id')

            if plan_org_id:
                # Filter: default initiatives OR initiatives from plan's organization
                from django.db.models import Q
                filtered_initiatives = all_initiatives.filter(
                    Q(is_default=True) | Q(organization_id=plan_org_id)
                )
                print(f"[ADMIN SERIALIZER] Filtered to {filtered_initiatives.count()} initiatives (defaults + org {plan_org_id})")
                initiatives = filtered_initiatives
            else:
                # No context, return all (shouldn't happen in admin view)
                print(f"[ADMIN SERIALIZER] WARNING: No plan_organization_id in context, returning all")
                initiatives = all_initiatives

            # Use admin initiative serializer and pass context
            from .serializers import AdminStrategicInitiativeSerializer
            serialized = AdminStrategicInitiativeSerializer(initiatives, many=True, context=self.context).data
            print(f"[ADMIN SERIALIZER] Serialized {len(serialized)} initiatives")

            return serialized
        except Exception as e:
            print(f"AdminStrategicObjectiveSerializer - Error getting initiatives: {e}")
            import traceback
            traceback.print_exc()
            return []

    def get_total_initiatives_weight(self, obj):
        try:
            initiatives = obj.initiatives.all()
            total = sum(float(i.weight or 0) for i in initiatives)
            return total
        except Exception as e:
            print(f"AdminStrategicObjectiveSerializer - Error calculating total weight: {e}")
            return 0


class AdminStrategicInitiativeSerializer(serializers.ModelSerializer):
    """Admin serializer that returns ALL measures and activities without organization filtering"""
    organization_name = serializers.CharField(source='organization.name', read_only=True)
    performance_measures = serializers.SerializerMethodField()
    main_activities = serializers.SerializerMethodField()
    total_measures_weight = serializers.SerializerMethodField()
    total_activities_weight = serializers.SerializerMethodField()
    initiative_feed_name = serializers.CharField(source='initiative_feed.name', read_only=True)

    class Meta:
        model = StrategicInitiative
        fields = [
            'id', 'name', 'weight', 'strategic_objective', 'program', 'organization',
            'organization_name', 'is_default', 'initiative_feed', 'initiative_feed_name',
            'performance_measures', 'main_activities', 'total_measures_weight',
            'total_activities_weight', 'created_at', 'updated_at'
        ]

    def get_performance_measures(self, obj):
        """Return performance measures filtered by plan's organization"""
        try:
            all_measures = obj.performance_measures.all()
            print(f"[ADMIN SERIALIZER] Initiative '{obj.name}': Found {all_measures.count()} total measures")

            plan_org_id = self.context.get('plan_organization_id')

            if plan_org_id:
                # PerformanceMeasure doesn't have is_default field, only filter by organization
                filtered_measures = all_measures.filter(organization_id=plan_org_id)
                print(f"[ADMIN SERIALIZER] Filtered to {filtered_measures.count()} measures for org {plan_org_id}")
                measures = filtered_measures
            else:
                measures = all_measures

            serialized = PerformanceMeasureSerializer(measures, many=True).data
            print(f"[ADMIN SERIALIZER] Serialized {len(serialized)} measures")
            return serialized
        except Exception as e:
            print(f"AdminStrategicInitiativeSerializer - Error getting measures: {e}")
            import traceback
            traceback.print_exc()
            return []

    def get_main_activities(self, obj):
        """Return main activities filtered by plan's organization"""
        try:
            all_activities = obj.main_activities.all()
            print(f"[ADMIN SERIALIZER] Initiative '{obj.name}': Found {all_activities.count()} total activities")

            plan_org_id = self.context.get('plan_organization_id')

            if plan_org_id:
                # MainActivity doesn't have is_default field, only filter by organization
                filtered_activities = all_activities.filter(organization_id=plan_org_id)
                print(f"[ADMIN SERIALIZER] Filtered to {filtered_activities.count()} activities for org {plan_org_id}")
                activities = filtered_activities
            else:
                activities = all_activities

            serialized = MainActivitySerializer(activities, many=True, context=self.context).data
            print(f"[ADMIN SERIALIZER] Serialized {len(serialized)} activities with sub_activities")
            for idx, act in enumerate(serialized):
                print(f"[ADMIN SERIALIZER]   Activity {idx}: '{act.get('name')}' has {len(act.get('sub_activities', []))} sub-activities")
            return serialized
        except Exception as e:
            print(f"AdminStrategicInitiativeSerializer - Error getting activities: {e}")
            import traceback
            traceback.print_exc()
            return []

    def get_total_measures_weight(self, obj):
        try:
            measures = obj.performance_measures.all()
            return sum(float(m.weight or 0) for m in measures)
        except Exception:
            return 0

    def get_total_activities_weight(self, obj):
        try:
            activities = obj.main_activities.all()
            return sum(float(a.weight or 0) for a in activities)
        except Exception:
            return 0


class AdminPlanSerializer(serializers.ModelSerializer):
    """Admin serializer for plans that returns ALL data without organization filtering"""
    organization_name = serializers.CharField(source='organization.name', read_only=True)
    objectives = serializers.SerializerMethodField()
    reviews = PlanReviewSerializer(many=True, read_only=True)
    selected_objectives = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=StrategicObjective.objects.all(),
        required=False
    )
    selected_objectives_weights = serializers.JSONField(required=False, allow_null=True)
    strategic_objective = serializers.PrimaryKeyRelatedField(
        queryset=StrategicObjective.objects.all(),
        required=False,
        allow_null=True
    )

    class Meta:
        model = Plan
        fields = [
            'id', 'organization', 'organization_name', 'planner_name', 'type',
            'executive_name', 'strategic_objective', 'program', 'fiscal_year',
            'from_date', 'to_date', 'status', 'submitted_at', 'selected_objectives',
            'selected_objectives_weights', 'objectives', 'reviews',
            'created_at', 'updated_at'
        ]

    def get_objectives(self, obj):
        """Get all selected objectives with their complete data - filter by plan's organization"""
        selected_objectives = obj.selected_objectives.all()

        if not selected_objectives and obj.strategic_objective:
            selected_objectives = [obj.strategic_objective]

        print(f"[ADMIN PLAN SERIALIZER] Plan {obj.id} from organization {obj.organization.name} (ID: {obj.organization.id})")
        print(f"[ADMIN PLAN SERIALIZER] Serializing {len(selected_objectives)} objectives")

        # Pass plan's organization in context so initiatives can be filtered
        context = {'plan_organization_id': obj.organization.id}
        serialized_data = AdminStrategicObjectiveSerializer(selected_objectives, many=True, context=context).data

        for idx, obj_data in enumerate(serialized_data):
            initiatives_count = len(obj_data.get('initiatives', []))
            print(f"[ADMIN PLAN SERIALIZER] Objective {idx}: '{obj_data.get('title')}' has {initiatives_count} initiatives")

        return serialized_data